import { useState } from "react";
import { queriesApi } from "./hosting";
import { ProcedureBuilder } from "./Procedures";
import { columnsOf, isNumericType, type DataRow, type DataTable, type SavedDef, type SavedItem } from "./dataops";

type Mode = "query" | "aggregate" | "action";
type FilterRow = { col: string; op: string; kind: "value" | "param"; text: string; optional: boolean };
type GroupRow = { col: string; part: string };
type AggRow = { fn: string; col: string; as: string };
type SetRow = { col: string; kind: "value" | "param"; text: string };
type JoinRow = { table: string; type: "left" | "inner"; on: { left: string; right: string }[] };

const OPS: [string, string][] = [["eq", "est égal à"], ["ne", "est différent de"], ["gt", "est supérieur à"], ["gte", "est supérieur ou égal à"], ["lt", "est inférieur à"], ["lte", "est inférieur ou égal à"], ["contains", "contient"], ["startsWith", "commence par"], ["isnull", "est vide"], ["notnull", "n'est pas vide"]];
const FNS: [string, string][] = [["count", "Nombre de lignes"], ["sum", "Somme"], ["avg", "Moyenne"], ["min", "Minimum"], ["max", "Maximum"]];
const PARTS: [string, string][] = [["", "valeur exacte"], ["day", "par jour"], ["month", "par mois"], ["year", "par année"]];
const JOIN_TYPES: [string, string][] = [["left", "garder toutes les lignes de gauche (même sans correspondance)"], ["inner", "garder seulement les lignes qui ont une correspondance"]];
const NAME_RE = /^[a-z][a-z0-9-]{1,39}$/;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erreur inconnue");
const box = { padding: "6px 0", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" } as const;
const mono = { fontFamily: "Consolas, monospace", fontSize: 12 } as const;

/** Nom de paramètre proposé à partir d'une colonne (lettres, chiffres, _). */
const paramName = (s: string) => s.replace(/[^a-z0-9_]/gi, "_").slice(0, 30) || "valeur";

function fromItem(it: SavedItem) {
  const d = it.def, q = (r: string) => (r.includes(".") ? r : `${d.table}.${r}`); // l'état interne est toujours « table.colonne »
  const cols = (d.columns ?? []).map((c) => (typeof c === "string" ? { col: c } : c)), aliases: Record<string, string> = {};
  for (const c of cols) if (c.as) aliases[q(c.col)] = c.as;
  return {
    mode: (it.kind === "action" ? "action" : d.aggregates && d.aggregates.length ? "aggregate" : "query") as Mode, table: d.table, description: d.description ?? "", columns: cols.map((c) => q(c.col)), aliases,
    joins: (d.joins ?? []).map((j): JoinRow => ({ table: j.table, type: j.type === "inner" ? "inner" : "left", on: j.on.map((o) => ({ left: q(o.left), right: o.right.includes(".") ? o.right : `${j.table}.${o.right}` })) })),
    filters: (d.filters ?? []).map((f): FilterRow => ({ col: q(f.col), op: f.op, kind: f.param !== undefined ? "param" : "value", text: f.param ?? (f.value === undefined || f.value === null ? "" : String(f.value)), optional: Boolean(f.optional) })),
    groups: (d.groupBy ?? []).map((g): GroupRow => ({ col: q(g.split(":")[0]), part: g.split(":")[1] ?? "" })),
    aggs: (d.aggregates ?? []).map((a): AggRow => ({ fn: a.fn, col: a.col ? q(a.col) : "", as: a.as ?? "" })),
    sets: (d.set ?? []).map((s): SetRow => ({ col: s.col, kind: s.param !== undefined ? "param" : "value", text: s.param ?? (s.value === undefined || s.value === null ? "" : String(s.value)) })),
    op: (d.op === "insert" ? "insert" : "update") as "update" | "insert", orderBy: d.orderBy ?? "", direction: (d.direction ?? "asc") as "asc" | "desc", limit: d.limit ? String(d.limit) : "",
  };
}

/** Création des routes personnalisées : formulaire guidé, sans code. Les définitions sont enregistrées sur le serveur. */
export function Queries({ importId, tables, items, onChanged, onUse }: { importId: string; tables: DataTable[]; items: SavedItem[]; onChanged: () => Promise<void>; onUse: (name: string) => void }) {
  const [editing, setEditing] = useState(false); const [proc, setProc] = useState<{ item?: SavedItem } | null>(null);
  const [name, setName] = useState(""); const [mode, setMode] = useState<Mode>("query");
  const [table, setTable] = useState(""); const [description, setDescription] = useState("");
  const [columns, setColumns] = useState<string[]>([]); const [aliases, setAliases] = useState<Record<string, string>>({}); const [joins, setJoins] = useState<JoinRow[]>([]);
  const [filters, setFilters] = useState<FilterRow[]>([]); const [groups, setGroups] = useState<GroupRow[]>([]); const [aggs, setAggs] = useState<AggRow[]>([]);
  const [sets, setSets] = useState<SetRow[]>([]); const [op, setOp] = useState<"update" | "insert">("update");
  const [orderBy, setOrderBy] = useState(""); const [direction, setDirection] = useState<"asc" | "desc">("asc"); const [limit, setLimit] = useState("");
  const [trial, setTrial] = useState<Record<string, string>>({}); const [result, setResult] = useState<{ rows: DataRow[]; total: number } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [info, setInfo] = useState("");

  const t = tables.find((x) => x.table === table);
  const tableOf = (n: string) => tables.find((x) => x.table === n);
  const colsOf = (tb: DataTable | undefined) => (tb ? columnsOf(tb).filter((c) => !tb.fields.find((f) => f.name === c.name)?.secret).map((c) => c.name) : []);
  const baseCols = colsOf(t);
  const used = [table, ...joins.map((j) => j.table)].filter(Boolean);
  const refs = used.flatMap((n) => colsOf(tableOf(n)).map((c) => `${n}.${c}`)); // colonnes utilisables, toujours qualifiées « table.colonne »
  const label = (r: string) => (joins.length ? r : r.slice(r.indexOf(".") + 1)); // sans jointure, on n'affiche pas le préfixe
  const typeOfRef = (r: string) => { const i = r.indexOf("."); return tableOf(r.slice(0, i))?.fields.find((f) => f.name === r.slice(i + 1))?.type ?? "TEXT"; };
  const typeOf = (c: string) => t?.fields.find((f) => f.name === c)?.type ?? "TEXT";
  const writable = t ? t.fields.filter((f) => !(op === "update" && f.name === t.primaryKey)).map((f) => f.name) : [];
  const shortCount = new Map<string, number>(); for (const r of columns.length ? columns : baseCols.map((c) => `${table}.${c}`)) shortCount.set(r.slice(r.indexOf(".") + 1), (shortCount.get(r.slice(r.indexOf(".") + 1)) ?? 0) + 1);
  const outName = (r: string) => aliases[r] || ((shortCount.get(r.slice(r.indexOf(".") + 1)) ?? 0) > 1 ? r.replace(".", "_") : r.slice(r.indexOf(".") + 1));
  const outputNames = mode === "aggregate" ? [...groups.map((g) => { const n = g.col.slice(g.col.indexOf(".") + 1); return g.part ? `${n}_${g.part}` : n; }), ...aggs.map((a) => a.as || (a.col ? `${a.fn}_${a.col.slice(a.col.indexOf(".") + 1)}` : "nombre"))] : (columns.length ? columns : baseCols.map((c) => `${table}.${c}`)).map(outName);

  const reset = (m: Mode = "query", tb = tables[0]?.table ?? "") => {
    setName(""); setMode(m); setTable(tb); setDescription(""); setColumns([]); setAliases({}); setJoins([]); setFilters([]); setGroups([]); setAggs([{ fn: "count", col: "", as: "" }]); setSets([]); setOp("update");
    setOrderBy(""); setDirection("asc"); setLimit(""); setTrial({}); setResult(null); setError(""); setInfo("");
  };
  const startNew = (m: Mode) => { reset(m); if (m === "aggregate") setAggs([{ fn: "count", col: "", as: "" }]); setEditing(true); };
  const edit = (it: SavedItem) => {
    const f = fromItem(it); reset(f.mode, f.table); setName(it.name); setDescription(f.description); setColumns(f.columns); setAliases(f.aliases); setJoins(f.joins); setFilters(f.filters); setGroups(f.groups); setAggs(f.aggs.length ? f.aggs : [{ fn: "count", col: "", as: "" }]);
    setSets(f.sets); setOp(f.op); setOrderBy(f.orderBy); setDirection(f.direction); setLimit(f.limit); setEditing(true);
  };

  const value = (col: string, text: string): string | number => (isNumericType(typeOfRef(col)) && text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : text);
  const buildDef = (): SavedDef => {
    const def: SavedDef = { table };
    const R = (r: string) => (joins.length || mode === "action" ? r : r.slice(r.indexOf(".") + 1)); // sans jointure : colonnes simples
    if (description.trim()) def.description = description.trim();
    if (mode !== "action") {
      if (joins.length) def.joins = joins.map((j) => ({ table: j.table, type: j.type, on: j.on.map((o) => ({ left: o.left, right: o.right })) }));
      def.filters = filters.map((f) => {
        if (f.op === "isnull" || f.op === "notnull") return { col: R(f.col), op: f.op };
        if (f.kind === "param") return { col: R(f.col), op: f.op, param: f.text.trim() || paramName(f.col.slice(f.col.indexOf(".") + 1)), ...(f.optional ? { optional: true } : {}) };
        return { col: R(f.col), op: f.op, value: value(f.col, f.text) };
      });
      if (mode === "query" && columns.length) def.columns = columns.map((c) => (aliases[c]?.trim() ? { col: R(c), as: aliases[c].trim() } : R(c)));
      if (mode === "aggregate") {
        def.groupBy = groups.map((g) => (g.part ? `${R(g.col)}:${g.part}` : R(g.col)));
        def.aggregates = aggs.map((a) => ({ fn: a.fn, ...(a.col ? { col: R(a.col) } : {}), ...(a.as.trim() ? { as: a.as.trim() } : {}) }));
      }
      if (orderBy) { def.orderBy = orderBy; def.direction = direction; }
      if (limit.trim()) def.limit = Number(limit);
    } else {
      def.op = op;
      def.set = sets.map((s) => (s.kind === "param" ? { col: s.col, param: s.text.trim() || paramName(s.col) } : { col: s.col, value: value(`${table}.${s.col}`, s.text) }));
    }
    return def;
  };
  const trialParams = (): string[] => [...new Set((mode === "action" ? [] : filters.filter((f) => f.kind === "param" && f.op !== "isnull" && f.op !== "notnull").map((f) => f.text.trim() || paramName(f.col.slice(f.col.indexOf(".") + 1)))))];

  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(""); setInfo(""); try { await fn(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); } };
  const save = () => run(async () => {
    if (!NAME_RE.test(name)) throw new Error("Nom invalide : 2 à 40 caractères, minuscules, chiffres et tirets, en commençant par une lettre (ex. ventes-du-mois).");
    if (!table) throw new Error("Choisissez une table.");
    await queriesApi.save(importId, name, mode === "action" ? "action" : "query", buildDef());
    await onChanged(); setInfo(`« ${name} » enregistrée : la route, le code VBA et les exemples sont générés (onglets Routes et Exemples).`); setEditing(false);
  });
  const tryIt = () => run(async () => { const r = await queriesApi.preview(importId, buildDef(), trial); setResult({ rows: r.data, total: r.total }); });
  const remove = (it: SavedItem) => { if (!window.confirm(`Supprimer « ${it.name} » ? Les macros ou rapports qui l'utilisent cesseront de fonctionner.`)) return; void run(async () => { await queriesApi.remove(importId, it.name); await onChanged(); }); };

  const prune = (names: string[]) => { // retire de la requête tout ce qui référence une table qui n'est plus liée
    const ok = (r: string) => !r || names.includes(r.slice(0, r.indexOf(".")));
    setColumns((c) => c.filter(ok)); setFilters((f) => f.filter((x) => ok(x.col))); setGroups((g) => g.filter((x) => ok(x.col))); setAggs((a) => a.map((x) => (ok(x.col) ? x : { ...x, col: "" })));
    setOrderBy((o) => (o.includes(".") && !ok(o) ? "" : o));
  };
  const addJoin = () => {
    const free = tables.find((x) => !used.includes(x.table)); if (!free) return;
    const guess = refs.find((r) => { const c = r.slice(r.indexOf(".") + 1).toLowerCase(), n = free.table.toLowerCase(); return c === n || c === n.replace(/s$/, "") || c === `id_${n.replace(/s$/, "")}` || c === `${n.replace(/s$/, "")}_id`; }) ?? "";
    setJoins([...joins, { table: free.table, type: "left", on: [{ left: guess, right: `${free.table}.${free.primaryKey}` }] }]);
  };
  const setJoin = (i: number, patch: Partial<JoinRow>) => { const old = joins[i]; setJoins(upd(joins, i, patch)); if (patch.table && patch.table !== old.table) { prune(used.filter((n) => n !== old.table)); setJoins(upd(joins, i, { ...patch, on: [{ left: "", right: `${patch.table}.${tableOf(patch.table)?.primaryKey ?? ""}` }] })); } };
  const dropJoin = (i: number) => { const old = joins[i]; setJoins(joins.filter((_, k) => k !== i)); prune(used.filter((n) => n !== old.table)); };
  const upd = <T extends object>(list: T[], i: number, patch: Partial<T>): T[] => list.map((x, k) => (k === i ? { ...x, ...patch } : x));
  const colSelect = (cols: string[], v: string, on: (c: string) => void, placeholder = "— colonne —", show: (c: string) => string = label) => (
    <select value={v} onChange={(e) => on(e.target.value)}><option value="">{placeholder}</option>{cols.map((c) => <option key={c} value={c}>{show(c)}</option>)}</select>
  );

  return (
    <div>
      <p className="muted">Créez vos propres routes sans écrire de code : une <b>requête</b> lit des données (filtres, totaux, regroupements), une <b>action</b> écrit une ligne, une <b>procédure</b> enchaîne plusieurs étapes en une seule transaction (ex. « créer une facture avec ses lignes et baisser le stock »). Chacune devient une route de l'API et une fonction VBA prête à copier.</p>
      {error && <p className="error" role="alert">{error}</p>}{info && <p className="ok">{info}</p>}

      {proc && <ProcedureBuilder importId={importId} tables={tables} item={proc.item} onCancel={() => setProc(null)} onDone={async (n) => { await onChanged(); setProc(null); setInfo(`Procédure « ${n} » enregistrée : route, code VBA et exemples générés.`); }} />}
      {!editing && !proc && (
        <>
          <div style={box}>
            <button className="primary" onClick={() => startNew("query")} disabled={!tables.length}>+ Requête de lecture</button>
            <button className="primary" onClick={() => startNew("aggregate")} disabled={!tables.length}>+ Calcul / regroupement</button>
            <button className="primary" onClick={() => startNew("action")} disabled={!tables.length}>+ Action (écriture)</button>
            <button className="primary" onClick={() => setProc({})} disabled={!tables.length}>+ Procédure (plusieurs étapes)</button>
          </div>
          {items.length === 0 ? <p className="muted">Aucune requête enregistrée pour ce classeur.</p> : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={{ textAlign: "left" }}>Nom</th><th style={{ textAlign: "left" }}>Type</th><th style={{ textAlign: "left" }}>Table</th><th style={{ textAlign: "left" }}>Paramètres</th><th /></tr></thead>
              <tbody>{items.map((it) => (
                <tr key={it.name} style={{ borderTop: "1px solid var(--line)" }}>
                  <td><b>{it.name}</b>{!it.valid && <span className="error"> ⚠ {it.error}</span>}{it.def.description && <div className="muted">{it.def.description}</div>}</td>
                  <td>{it.kind === "procedure" ? "Procédure" : it.kind === "action" ? (it.def.op === "insert" ? "Action : ajouter" : "Action : modifier") : it.def.aggregates?.length ? "Calcul" : "Lecture"}</td>
                  <td>{it.kind === "procedure" ? `${(it.def as unknown as { steps: unknown[] }).steps.length} étape(s)` : [it.def.table, ...(it.def.joins ?? []).map((j) => j.table)].join(" + ")}</td><td style={mono}>{it.params.map((p) => p.name + (p.optional ? "?" : "")).join(", ") || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}><button onClick={() => onUse(it.name)}>Code</button> <button onClick={() => (it.kind === "procedure" ? setProc({ item: it }) : edit(it))}>Modifier</button> <button disabled={busy} onClick={() => remove(it)}>Supprimer</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </>
      )}

      {editing && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>{mode === "action" ? "Action (écriture)" : mode === "aggregate" ? "Calcul / regroupement" : "Requête de lecture"}</h4>
          <div style={box}>
            <label>Nom de la route <input value={name} maxLength={40} placeholder="ventes-du-mois" onChange={(e) => setName(e.target.value.toLowerCase())} style={mono} /></label>
            <label>Table <select value={table} onChange={(e) => { setTable(e.target.value); setJoins([]); setAliases({}); setColumns([]); setFilters([]); setGroups([]); setSets([]); setOrderBy(""); setAggs([{ fn: "count", col: "", as: "" }]); setResult(null); }}>{tables.map((x) => <option key={x.table} value={x.table}>{x.table}</option>)}</select></label>
          </div>
          <div style={box}><label style={{ flex: 1 }}>Description <input style={{ width: "100%" }} maxLength={200} value={description} placeholder="À quoi sert cette route ? (apparaît dans la documentation)" onChange={(e) => setDescription(e.target.value)} /></label></div>

          {mode === "query" && (
            <div style={{ margin: "8px 0" }}>
              <b>Colonnes à renvoyer</b> <span className="muted">(aucune cochée = toutes)</span>
              <div style={box}>{(joins.length ? used : [table]).map((n) => (
                <div key={n} style={{ width: "100%" }}>{joins.length > 0 && <b className="muted">{n} : </b>}
                  {colsOf(tableOf(n)).map((c) => { const r = `${n}.${c}`, on = columns.includes(r); return (
                    <label key={r} style={{ marginRight: 8 }}><input type="checkbox" checked={on} onChange={(e) => setColumns(e.target.checked ? [...columns, r] : columns.filter((x) => x !== r))} /> {c}
                      {on && joins.length > 0 && <input style={{ ...mono, width: 90, marginLeft: 4 }} value={aliases[r] ?? ""} placeholder="nom affiché" onChange={(e) => setAliases({ ...aliases, [r]: e.target.value.toLowerCase() })} />}</label>); })}
                </div>))}</div>
              {joins.length > 0 && <p className="muted">Rien de coché = toutes les colonnes de « {table} » seulement : cochez les colonnes des autres tables pour les voir dans le rapport.</p>}
            </div>
          )}

          {mode === "aggregate" && (
            <>
              <div style={{ margin: "8px 0" }}>
                <b>Regrouper par</b> <span className="muted">(facultatif : par client, par mois…)</span>
                {groups.map((g, i) => (
                  <div key={i} style={box}>{colSelect(refs, g.col, (c) => setGroups(upd(groups, i, { col: c })))}
                    <select value={g.part} onChange={(e) => setGroups(upd(groups, i, { part: e.target.value }))}>{PARTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    <button onClick={() => setGroups(groups.filter((_, k) => k !== i))}>✕</button></div>
                ))}
                <button onClick={() => setGroups([...groups, { col: refs[0] ?? "", part: "" }])}>+ Regroupement</button>
              </div>
              <div style={{ margin: "8px 0" }}>
                <b>Calculs</b>
                {aggs.map((a, i) => (
                  <div key={i} style={box}>
                    <select value={a.fn} onChange={(e) => setAggs(upd(aggs, i, { fn: e.target.value, col: e.target.value === "count" ? "" : a.col }))}>{FNS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    {a.fn !== "count" && colSelect(a.fn === "sum" || a.fn === "avg" ? refs.filter((c) => isNumericType(typeOfRef(c))) : refs, a.col, (c) => setAggs(upd(aggs, i, { col: c })))}
                    <label>nommé <input style={{ ...mono, width: 120 }} value={a.as} placeholder="auto" onChange={(e) => setAggs(upd(aggs, i, { as: e.target.value.toLowerCase() }))} /></label>
                    {aggs.length > 1 && <button onClick={() => setAggs(aggs.filter((_, k) => k !== i))}>✕</button>}
                  </div>
                ))}
                <button onClick={() => setAggs([...aggs, { fn: "sum", col: "", as: "" }])}>+ Calcul</button>
              </div>
            </>
          )}

          {mode !== "action" && (
            <div style={{ margin: "8px 0" }}>
              <b>Tables liées</b> <span className="muted">(facultatif : ajoutez le client, le produit, l'utilisateur… dans le même rapport)</span>
              {joins.map((j, i) => (
                <div key={i} style={{ ...box, borderLeft: "3px solid var(--line)", paddingLeft: 8 }}>
                  <select value={j.table} onChange={(e) => setJoin(i, { table: e.target.value })}>{tables.filter((x) => x.table === j.table || !used.includes(x.table)).map((x) => <option key={x.table} value={x.table}>{x.table}</option>)}</select>
                  <span>lié par</span>
                  {j.on.map((o, k) => (
                    <span key={k} style={box}>
                      {colSelect(refs.filter((r) => !r.startsWith(`${j.table}.`)), o.left, (c) => setJoins(upd(joins, i, { on: upd(j.on, k, { left: c }) })), "— colonne —")}
                      <span>=</span>
                      {colSelect(colsOf(tableOf(j.table)).map((c) => `${j.table}.${c}`), o.right, (c) => setJoins(upd(joins, i, { on: upd(j.on, k, { right: c }) })), "— colonne —", (c) => c)}
                      {j.on.length > 1 && <button onClick={() => setJoins(upd(joins, i, { on: j.on.filter((_, m) => m !== k) }))}>✕</button>}
                    </span>
                  ))}
                  {j.on.length < 3 && <button onClick={() => setJoins(upd(joins, i, { on: [...j.on, { left: "", right: "" }] }))}>+ liaison</button>}
                  <select value={j.type} onChange={(e) => setJoin(i, { type: e.target.value as "left" | "inner" })}>{JOIN_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  <button onClick={() => dropJoin(i)}>✕</button>
                </div>
              ))}
              {joins.length < 5 && tables.length > used.length && <button onClick={addJoin}>+ Table liée</button>}
            </div>
          )}

          {mode !== "action" && (
            <div style={{ margin: "8px 0" }}>
              <b>Filtres</b> <span className="muted">(toutes les conditions doivent être vraies)</span>
              {filters.map((f, i) => (
                <div key={i} style={box}>
                  {colSelect(refs, f.col, (c) => setFilters(upd(filters, i, { col: c })))}
                  <select value={f.op} onChange={(e) => setFilters(upd(filters, i, { op: e.target.value }))}>{OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  {f.op !== "isnull" && f.op !== "notnull" && (<>
                    <select value={f.kind} onChange={(e) => setFilters(upd(filters, i, { kind: e.target.value as "value" | "param", text: "" }))}><option value="value">valeur fixe</option><option value="param">paramètre (fourni à l'appel)</option></select>
                    <input style={f.kind === "param" ? mono : undefined} value={f.text} placeholder={f.kind === "param" ? paramName(f.col.slice(f.col.indexOf(".") + 1) || "valeur") : "valeur"} onChange={(e) => setFilters(upd(filters, i, { text: e.target.value }))} />
                    {f.kind === "param" && <label><input type="checkbox" checked={f.optional} onChange={(e) => setFilters(upd(filters, i, { optional: e.target.checked }))} /> facultatif</label>}
                  </>)}
                  <button onClick={() => setFilters(filters.filter((_, k) => k !== i))}>✕</button>
                </div>
              ))}
              <button onClick={() => setFilters([...filters, { col: refs[0] ?? "", op: "eq", kind: "value", text: "", optional: false }])} disabled={!refs.length}>+ Filtre</button>
            </div>
          )}

          {mode !== "action" && (
            <div style={box}>
              <label>Trier par {colSelect(outputNames, orderBy, setOrderBy, "— défaut —")}</label>
              <select value={direction} onChange={(e) => setDirection(e.target.value as "asc" | "desc")}><option value="asc">croissant</option><option value="desc">décroissant</option></select>
              <label>Limite <input type="number" min={1} max={500} style={{ width: 80 }} value={limit} placeholder="100" onChange={(e) => setLimit(e.target.value)} /></label>
            </div>
          )}

          {mode === "action" && (
            <div style={{ margin: "8px 0" }}>
              <div style={box}>
                <label><input type="radio" checked={op === "update"} onChange={() => { setOp("update"); setSets(sets.filter((s) => s.col !== t?.primaryKey)); }} /> Modifier une ligne (identifiée par sa clé à l'appel)</label>
                <label><input type="radio" checked={op === "insert"} onChange={() => setOp("insert")} /> Ajouter une ligne</label>
              </div>
              <b>Valeurs à écrire</b>
              {sets.map((s, i) => {
                const secret = Boolean(t?.fields.find((f) => f.name === s.col)?.secret);
                return (
                  <div key={i} style={box}>
                    {colSelect(writable, s.col, (c) => setSets(upd(sets, i, { col: c })))}
                    <span>=</span>
                    <select value={secret ? "param" : s.kind} disabled={secret} onChange={(e) => setSets(upd(sets, i, { kind: e.target.value as "value" | "param", text: "" }))}><option value="value">valeur fixe</option><option value="param">paramètre (fourni à l'appel)</option></select>
                    <input style={s.kind === "param" || secret ? mono : undefined} value={s.text} placeholder={s.kind === "param" || secret ? paramName(s.col || "valeur") : "valeur"} onChange={(e) => setSets(upd(sets, i, { text: e.target.value }))} />
                    {secret && <span className="muted">🔒 champ protégé : toujours un paramètre, haché à l'écriture</span>}
                    <button onClick={() => setSets(sets.filter((_, k) => k !== i))}>✕</button>
                  </div>
                );
              })}
              <button onClick={() => setSets([...sets, { col: writable[0] ?? "", kind: "value", text: "" }])} disabled={!writable.length}>+ Valeur</button>
              <p className="muted">Les modifications sont versionnées : si quelqu'un a modifié la ligne entre-temps, le serveur refuse l'écriture au lieu de l'écraser.</p>
            </div>
          )}

          {mode !== "action" && (
            <div style={{ margin: "8px 0" }}>
              <b>Essayer</b>
              <div style={box}>
                {trialParams().map((p) => <label key={p}>{p} <input style={mono} value={trial[p] ?? ""} onChange={(e) => setTrial({ ...trial, [p]: e.target.value })} /></label>)}
                <button disabled={busy || !table} onClick={() => void tryIt()}>Lancer l'essai (20 lignes max, rien n'est enregistré)</button>
              </div>
              {result && (
                <div style={{ overflow: "auto", maxHeight: 260 }}>
                  <div className="muted">{result.total} ligne(s) au total</div>
                  <table style={{ borderCollapse: "collapse", ...mono }}>
                    <thead><tr>{(result.rows[0] ? Object.keys(result.rows[0]) : []).map((c) => <th key={c} style={{ textAlign: "left", paddingRight: 14 }}>{c}</th>)}</tr></thead>
                    <tbody>{result.rows.map((r, i) => <tr key={i}>{Object.keys(r).map((c) => <td key={c} style={{ paddingRight: 14 }}>{r[c] === null ? "" : String(r[c])}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div style={box}>
            <button className="primary" disabled={busy} onClick={() => void save()}>Enregistrer</button>
            <button disabled={busy} onClick={() => { setEditing(false); setError(""); }}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}
