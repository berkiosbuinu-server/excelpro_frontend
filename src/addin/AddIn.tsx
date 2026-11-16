import { useEffect, useState } from "react";
import { api, setToken, hasToken } from "../api";
import { dataApi, hosting, resetHostingSession, type ImportRow } from "../hosting";
import { buildSheet, columnsOf, diffSheet, isNumericType, VERSION_COL, type Change, type DataTable, type Sheet } from "../dataops";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Excel: any;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erreur inconnue");
const sheetName = (t: string) => `BK_${t}`.slice(0, 31);
const snapName = (t: string) => `_BKS_${t}`.slice(0, 31);
const PAGE = 500;

async function fetchAll(importId: string, table: string) {
  const out: Record<string, string | null>[] = []; let offset = 0, total = 0;
  do { const r = await dataApi.list(importId, table, { limit: PAGE, offset, orderBy: "_berkios_created_at" }); out.push(...(r.data as never[])); total = r.total; offset += PAGE; if (!r.data.length) break; } while (offset < total);
  return out;
}

/** Charge les lignes du serveur dans la feuille « BK_<table> » (+ un instantané masqué pour détecter vos modifications). */
async function pull(importId: string, t: DataTable) {
  const rows = await fetchAll(importId, t.table), sh = buildSheet(t, rows as never[]), n = sh.header.length;
  await Excel.run(async (ctx: any) => {
    const wb = ctx.workbook;
    const get = (name: string) => { const w = wb.worksheets.getItemOrNullObject(name); return w; };
    const main = get(sheetName(t.table)), snap = get(snapName(t.table)); await ctx.sync();
    const ws = main.isNullObject ? wb.worksheets.add(sheetName(t.table)) : main;
    const ss = snap.isNullObject ? wb.worksheets.add(snapName(t.table)) : snap;
    ws.getRange().clear(); ss.getRange().clear();
    const fmt = (sheet: any, rowsN: number, extra: number) => { if (rowsN < 1) return; sheet.getRangeByIndexes(0, 0, rowsN, n + extra).numberFormat = Array.from({ length: rowsN }, () => [...sh.types.map((ty) => (isNumericType(ty) ? "General" : "@")), ...Array(extra).fill("@")]); };
    // Feuille de travail : en-tête + données
    fmt(ws, sh.values.length + 1, 0);
    ws.getRangeByIndexes(0, 0, 1, n).values = [sh.header];
    if (sh.values.length) ws.getRangeByIndexes(1, 0, sh.values.length, n).values = sh.values;
    ws.getRangeByIndexes(0, 0, 1, n).format.font.bold = true;
    ws.getRangeByIndexes(0, 0, 1, n).format.fill.color = "#E3F4EA";
    ws.freezePanes.freezeRows(1);
    if (t.generatedPrimaryKey) ws.getRangeByIndexes(0, 0, 1, 1).format.fill.color = "#DDDDDD";
    ws.getUsedRange().format.autofitColumns();
    // Instantané masqué : ligne 1 = repères ; ligne 2 = en-tête + version ; puis les valeurs d'origine
    fmt(ss, sh.values.length + 2, 1);
    ss.getRangeByIndexes(0, 0, 1, 4).values = [["importId", importId, "table", t.table]];
    ss.getRangeByIndexes(1, 0, 1, n + 1).values = [[...sh.header, VERSION_COL]];
    if (sh.values.length) ss.getRangeByIndexes(2, 0, sh.values.length, n + 1).values = sh.values.map((r, i) => [...r, sh.versions[i]]);
    ss.visibility = "Hidden";
    ws.activate(); await ctx.sync();
  });
  return rows.length;
}

/** Lit la feuille de travail et l'instantané ; calcule les changements à envoyer. */
async function readChanges(importId: string, t: DataTable, withDeletes: boolean) {
  const n = columnsOf(t).length;
  const { cur, snapVals } = await Excel.run(async (ctx: any) => {
    const ws = ctx.workbook.worksheets.getItemOrNullObject(sheetName(t.table)), ss = ctx.workbook.worksheets.getItemOrNullObject(snapName(t.table)); await ctx.sync();
    if (ws.isNullObject || ss.isNullObject) throw new Error("Cette table n'a pas encore été chargée dans ce classeur : cliquez d'abord sur « Charger depuis le serveur ».");
    const a = ws.getUsedRange(true); a.load("values"); const b = ss.getUsedRange(true); b.load("values"); await ctx.sync();
    return { cur: a.values as unknown[][], snapVals: b.values as unknown[][] };
  });
  if (String(snapVals[0]?.[1]) !== importId || String(snapVals[0]?.[3]) !== t.table) throw new Error("La feuille provient d'une autre importation : rechargez-la depuis le serveur.");
  const header = (cur[0] ?? []).slice(0, n).map(String), expected = columnsOf(t).map((c) => c.name);
  if (header.join("|") !== expected.join("|")) throw new Error("Les en-têtes de la feuille ont été modifiés. Ne renommez, ne déplacez et ne supprimez aucune colonne (rechargez pour repartir d'une feuille propre).");
  const snapRows = snapVals.slice(2);
  const snapshot: Sheet = { header: expected, types: columnsOf(t).map((c) => c.type), values: snapRows.map((r) => r.slice(0, n) as never[]), versions: snapRows.map((r) => String(r[n] ?? "1")) };
  return diffSheet(t, snapshot, cur.slice(1).map((r) => r.slice(0, n)), { withDeletes });
}

const describe = (c: Change) => c.kind === "insert" ? `➕ ligne ${c.line}` : c.kind === "update" ? `✏️ ${c.key} (${Object.keys(c.values).join(", ")})` : `🗑️ ${c.key}`;

export function AddIn({ inExcel }: { inExcel: boolean }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [importId, setImportId] = useState("");
  const [tables, setTables] = useState<DataTable[]>([]);
  const [tableName, setTableName] = useState("");
  const [withDeletes, setWithDeletes] = useState(false);
  const [preview, setPreview] = useState<{ changes: Change[]; errors: string[] } | null>(null);
  const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [info, setInfo] = useState("");
  const table = tables.find((t) => t.table === tableName) ?? null;

  const loadImports = async () => {
    const all = await hosting.list(); const done = all.filter((r) => r.state === "completed");
    setImports(done); if (done[0]) setImportId((cur) => cur || done[0].id);
  };
  useEffect(() => {
    if (!hasToken()) { setAuthed(false); return; }
    api.me().then(async () => { setAuthed(true); await loadImports(); }).catch(() => { setToken(null); setAuthed(false); });
    return () => resetHostingSession();
  }, []);
  useEffect(() => {
    setTables([]); setTableName(""); setPreview(null);
    if (!importId) return;
    dataApi.schema(importId).then((s) => { setTables(s.tables); setTableName(s.tables[0]?.table ?? ""); }).catch((e) => setError(errMsg(e)));
  }, [importId]);

  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); setError(""); setInfo(""); try { await fn(); } catch (e) { setError(errMsg(e)); } finally { setBusy(""); } };

  if (!inExcel) return <main style={{ padding: 16 }}><h2>ExcelPro — Hébergement</h2><p className="warn">Ce volet fonctionne uniquement à l'intérieur d'Excel. Ouvrez votre classeur dans Excel puis ajoutez le complément (Insertion → Compléments → Mes compléments → Charger mon complément).</p></main>;
  if (authed === null) return <main style={{ padding: 16 }}><p className="muted">Chargement…</p></main>;
  if (!authed) return (
    <main style={{ padding: 16 }}>
      <h2>Connexion ExcelPro</h2>
      <p className="muted">Utilisez le compte avec lequel vous avez hébergé votre classeur.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <form onSubmit={(e) => { e.preventDefault(); void run("login", async () => { const r = await api.login(email.trim(), pw); setToken(r.token); setPw(""); setAuthed(true); await loadImports(); }); }}>
        <label style={{ display: "block", margin: "8px 0" }}>E-mail<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label style={{ display: "block", margin: "8px 0" }}>Mot de passe<input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
        <button className="primary" disabled={busy !== ""}>{busy ? "Connexion…" : "Se connecter"}</button>
      </form>
    </main>
  );

  return (
    <main style={{ padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Hébergement</h2>
        <button onClick={() => { setToken(null); resetHostingSession(); setAuthed(false); setImports([]); setImportId(""); }}>Déconnexion</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {info && <p className="ok">{info}</p>}
      {imports.length === 0 ? <p className="muted">Aucune importation terminée. Publiez d'abord votre classeur depuis ExcelPro → Hébergement.</p> : (
        <>
          <label style={{ display: "block", margin: "10px 0" }}>Classeur hébergé
            <select value={importId} onChange={(e) => setImportId(e.target.value)}>{imports.map((r) => <option key={r.id} value={r.id}>{r.fileName}</option>)}</select>
          </label>
          <label style={{ display: "block", margin: "10px 0" }}>Table
            <select value={tableName} onChange={(e) => { setTableName(e.target.value); setPreview(null); }}>{tables.map((t) => <option key={t.table} value={t.table}>{t.table}</option>)}</select>
          </label>
          {table && table.fields.some((f) => f.secret) && <p className="muted">🔒 Les colonnes protégées ({table.fields.filter((f) => f.secret).map((f) => f.name).join(", ")}) ne sont pas affichées ici : modifiez-les depuis ExcelPro.</p>}
          <button className="primary" disabled={!table || busy !== ""} onClick={() => run("pull", async () => { const n = await pull(importId, table!); setPreview(null); setInfo(`${n} ligne(s) chargée(s) dans la feuille ${sheetName(table!.table)}.`); })}>
            {busy === "pull" ? "Chargement…" : "⬇ Charger depuis le serveur"}
          </button>
          <hr />
          <p className="muted">Modifiez, ajoutez ou supprimez des lignes dans la feuille <b>{table ? sheetName(table.table) : ""}</b>, puis envoyez. Les colonnes grisées (clé générée) ne se modifient pas.</p>
          <label style={{ display: "flex", gap: 6, alignItems: "center", margin: "8px 0" }}><input type="checkbox" checked={withDeletes} onChange={(e) => { setWithDeletes(e.target.checked); setPreview(null); }} />Supprimer aussi du serveur les lignes que j'ai retirées de la feuille</label>
          <button disabled={!table || busy !== ""} onClick={() => run("diff", async () => { const d = await readChanges(importId, table!, withDeletes); setPreview(d); if (!d.changes.length && !d.errors.length) setInfo("Aucune modification à envoyer."); })}>{busy === "diff" ? "Analyse…" : "Voir mes modifications"}</button>
          {preview && (
            <div className="card" style={{ marginTop: 10 }}>
              {preview.errors.map((e, i) => <p key={i} className="error">{e}</p>)}
              {preview.changes.length > 0 && (
                <>
                  <b>{preview.changes.length} modification(s) :</b>
                  <ul style={{ maxHeight: 160, overflow: "auto" }}>{preview.changes.slice(0, 200).map((c, i) => <li key={i}>{describe(c)}</li>)}</ul>
                  <button className="primary" disabled={busy !== "" || preview.errors.length > 0} onClick={() => run("push", async () => {
                    const fails: string[] = []; let ok = 0;
                    for (const c of preview.changes) {
                      try {
                        if (c.kind === "insert") await dataApi.insert(importId, table!.table, c.values);
                        else if (c.kind === "update") await dataApi.update(importId, table!.table, c.key, c.expectedVersion, c.values);
                        else await dataApi.remove(importId, table!.table, c.key, c.expectedVersion);
                        ok++;
                      } catch (e) { fails.push(`${describe(c)} : ${errMsg(e)}`); }
                    }
                    await pull(importId, table!); setPreview(null);
                    setInfo(`${ok} modification(s) envoyée(s). La feuille a été rechargée.`);
                    if (fails.length) setError(`${fails.length} échec(s) :\n` + fails.slice(0, 10).join("\n"));
                  })}>{busy === "push" ? "Envoi…" : "⬆ Envoyer au serveur"}</button>
                  {preview.errors.length > 0 && <p className="warn">Corrigez les erreurs ci-dessus avant d'envoyer.</p>}
                </>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
