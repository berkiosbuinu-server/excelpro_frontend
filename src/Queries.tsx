import { useState } from "react";
import { queriesApi } from "./hosting";
import { columnsOf, isNumericType, type DataRow, type DataTable, type SavedDef, type SavedItem } from "./dataops";

type Mode = "query" | "aggregate" | "action";
type FilterRow = { col: string; op: string; kind: "value" | "param"; text: string; optional: boolean };
type GroupRow = { col: string; part: string };
type AggRow = { fn: string; col: string; as: string };
type SetRow = { col: string; kind: "value" | "param"; text: string };

const OPS: [string, string][] = [["eq", "est égal à"], ["ne", "est différent de"], ["gt", "est supérieur à"], ["gte", "est supérieur ou égal à"], ["lt", "est inférieur à"], ["lte", "est inférieur ou égal à"], ["contains", "contient"], ["startsWith", "commence par"], ["isnull", "est vide"], ["notnull", "n'est pas vide"]];
const FNS: [string, string][] = [["count", "Nombre de lignes"], ["sum", "Somme"], ["avg", "Moyenne"], ["min", "Minimum"], ["max", "Maximum"]];
const PARTS: [string, string][] = [["", "valeur exacte"], ["day", "par jour"], ["month", "par mois"], ["year", "par année"]];
const NAME_RE = /^[a-z][a-z0-9-]{1,39}$/;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erreur inconnue");
const box = { padding: "6px 0", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" } as const;
const mono = { fontFamily: "Consolas, monospace", fontSize: 12 } as const;

/** Nom de paramètre proposé à partir d'une colonne (lettres, chiffres, _). */
const paramName = (s: string) => s.replace(/[^a-z0-9_]/gi, "_").slice(0, 30) || "valeur";

function fromItem(it: SavedItem): { mode: Mode; table: string; description: string; columns: string[]; filters: FilterRow[]; groups: GroupRow[]; aggs: AggRow[]; sets: SetRow[]; op: "update" | "insert"; orderBy: string; direction: "asc" | "desc"; limit: string } {
  const d = it.def;
  return {
    mode: it.kind === "action" ? "action" : d.aggregates && d.aggregates.length ? "aggregate" : "query", table: d.table, description: d.description ?? "", columns: d.columns ?? [],
    filters: (d.filters ?? []).map((f) => ({ col: f.col, op: f.op, kind: f.param !== undefined ? "param" : "value", text: f.param ?? (f.value === undefined || f.value === null ? "" : String(f.value)), optional: Boolean(f.optional) })),
    groups: (d.groupBy ?? []).map((g) => ({ col: g.split(":")[0], part: g.split(":")[1] ?? "" })),
    aggs: (d.aggregates ?? []).map((a) => ({ fn: a.fn, col: a.col ?? "", as: a.as ?? "" })),
    sets: (d.set ?? []).map((s) => ({ col: s.col, kind: s.param !== undefined ? "param" : "value", text: s.param ?? (s.value === undefined || s.value === null ? "" : String(s.value)) })),
    op: d.op === "insert" ? "insert" : "update", orderBy: d.orderBy ?? "", direction: d.direction ?? "asc", limit: d.limit ? String(d.limit) : "",
  };
}

/** Création des routes personnalisées : formulaire guidé, sans code. Les définitions sont enregistrées sur le serveur. */
export function Queries({ importId, tables, items, onChanged, onUse }: { importId: string; tables: DataTable[]; items: SavedItem[]; onChanged: () => Promise<void>; onUse: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(""); const [mode, setMode] = useState<Mode>("query");
  const [table, setTable] = useState(""); const [description, setDescription] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterRow[]>([]); const [groups, setGroups] = useState<GroupRow[]>([]); const [aggs, setAggs] = useState<AggRow[]>([]);
  const [sets, setSets] = useState<SetRow[]>([]); const [op, setOp] = useState<"update" | "insert">("update");
  const [orderBy, setOrderBy] = useState(""); const [direction, setDirection] = useState<"asc" | "desc">("asc"); const [limit, setLimit] = useState("");
  const [trial, setTrial] = useState<Record<string, string>>({}); const [result, setResult] = useState<{ rows: DataRow[]; total: number } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [info, setInfo] = useState("");

  const t = tables.find((x) => x.table === table);
  const readable = t ? columnsOf(t).filter((c) => !t.fields.find((f) => f.name === c.name)?.secret).map((c) => c.name) : [];
  const typeOf = (c: string) => t?.fields.find((f) => f.name === c)?.type ?? "TEXT";
  const writable = t ? t.fields.filter((f) => !(op === "update" && f.name === t.primaryKey)).map((f) => f.name) : [];
  const outputNames = mode === "aggregate" ? [...groups.map((g) => (g.part ? `${g.col}_${g.part}` : g.col)), ...aggs.map((a) => a.as || (a.col ? `${a.fn}_${a.col}` : "nombre"))] : columns.length ? columns : readable;

  const reset = (m: Mode = "query", tb = tables[0]?.table ?? "") => {
    setName(""); setMode(m); setTable(tb); setDescription(""); setColumns([]); setFilters([]); setGroups([]); setAggs([{ fn: "count", col: "", as: "" }]); setSets([]); setOp("update");
    setOrderBy(""); setDirection("asc"); setLimit(""); setTrial({}); setResult(null); setError(""); setInfo("");
  };
  const startNew = (m: Mode) => { reset(m); if (m === "aggregate") setAggs([{ fn: "count", col: "", as: "" }]); setEditing(true); };
  const edit = (it: SavedItem) => {
    const f = fromItem(it); reset(f.mode, f.table); setName(it.name); setDescription(f.description); setColumns(f.columns); setFilters(f.filters); setGroups(f.groups); setAggs(f.aggs.length ? f.aggs : [{ fn: "count", col: "", as: "" }]);
    setSets(f.sets); setOp(f.op); setOrderBy(f.orderBy); setDirection(f.direction); setLimit(f.limit); setEditing(true);
  };

  const value = (col: string, text: string): string | number => (isNumericType(typeOf(col)) && text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : text);
  const buildDef = (): SavedDef => {
    const def: SavedDef = { table };
    if (description.trim()) def.description = description.trim();
    if (mode !== "action") {
      def.filters = filters.map((f) => {
        if (f.op === "isnull" || f.op === "notnull") return { col: f.col, op: f.op };
        if (f.kind === "param") return { col: f.col, op: f.op, param: f.text.trim() || paramName(f.col), ...(f.optional ? { optional: true } : {}) };
        return { col: f.col, op: f.op, value: value(f.col, f.text) };
      });
      if (mode === "query" && columns.length) def.columns = columns;
      if (mode === "aggregate") {
        def.groupBy = groups.map((g) => (g.part ? `${g.col}:${g.part}` : g.col));
        def.aggregates = aggs.map((a) => ({ fn: a.fn, ...(a.col ? { col: a.col } : {}), ...(a.as.trim() ? { as: a.as.trim() } : {}) }));
      }
      if (orderBy) { def.orderBy = orderBy; def.direction = direction; }
      if (limit.trim()) def.limit = Number(limit);
    } else {
      def.op = op;
      def.set = sets.map((s) => (s.kind === "param" ? { col: s.col, param: s.text.trim() || paramName(s.col) } : { col: s.col, value: value(s.col, s.text) }));
    }
    return def;
  };
  const trialParams = (): string[] => [...new Set((mode === "action" ? [] : filters.filter((f) => f.kind === "param" && f.op !== "isnull" && f.op !== "notnull").map((f) => f.text.trim() || paramName(f.col))))];

  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(""); setInfo(""); try { await fn(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); } };
  const save = () => run(async () => {
    if (!NAME_RE.test(name)) throw new Error("Nom invalide : 2 à 40 caractères, minuscules, chiffres et tirets, en commençant par une lettre (ex. ventes-du-mois).");
    if (!table) throw new Error("Choisissez une table.");
    await queriesApi.save(importId, name, mode === "action" ? "action" : "query", buildDef());
    await onChanged(); setInfo(`« ${name} » enregistrée : la route, le code VBA et les exemples sont générés (onglets Routes et Exemples).`); setEditing(false);
  });
  const tryIt = () => run(async () => { const r = await queriesApi.preview(importId, buildDef(), trial); setResult({ rows: r.data, total: r.total }); });
  const remove = (it: SavedItem) => { if (!window.confirm(`Supprimer « ${it.name} » ? Les macros ou rapports qui l'utilisent cesseront de fonctionner.`)) return; void run(async () => { await queriesApi.remove(importId, it.name); await onChanged(); }); };

  const upd = <T extends object>(list: T[], i: number, patch: Partial<T>): T[] => list.map((x, k) => (k === i ? { ...x, ...patch } : x));
  const colSelect = (cols: string[], v: string, on: (c: string) => void, placeholder = "— colonne —") => (
    <select value={v} onChange={(e) => on(e.target.value)}><option value="">{placeholder}</option>{cols.map((c) => <option key={c} value={c}>{c}</option>)}</select>
  );

  return (
    <div>
      <p className="muted">Créez vos propres routes sans écrire de code : une <b>requête</b> lit des données (filtres, totaux, regroupements), une <b>action</b> écrit (ex. « valider une facture »). Chacune devient une route de l'API et une fonction VBA prête à copier.</p>
      {error && <p className="error" role="alert">{error}</p>}{info && <p className="ok">{info}</p>}

      {!editing && (
        <>
          <div style={box}>
            <button className="primary" onClick={() => startNew("query")} disabled={!tables.length}>+ Requête de lecture</button>
            <button className="primary" onClick={() => startNew("aggregate")} disabled={!tables.length}>+ Calcul / regroupement</button>
            <button className="primary" onClick={() => startNew("action")} disabled={!tables.length}>+ Action (écriture)</button>
          </div>
          {items.length === 0 ? <p className="muted">Aucune requête enregistrée pour ce classeur.</p> : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={{ textAlign: "left" }}>Nom</th><th style={{ textAlign: "left" }}>Type</th><th style={{ textAlign: "left" }}>Table</th><th style={{ textAlign: "left" }}>Paramètres</th><th /></tr></thead>
              <tbody>{items.map((it) => (
                <tr key={it.name} style={{ borderTop: "1px solid var(--line)" }}>
                  <td><b>{it.name}</b>{!it.valid && <span className="error"> ⚠ {it.error}</span>}{it.def.description && <div className="muted">{it.def.description}</div>}</td>
                  <td>{it.kind === "action" ? (it.def.op === "insert" ? "Action : ajouter" : "Action : modifier") : it.def.aggregates?.length ? "Calcul" : "Lecture"}</td>
                  <td>{it.def.table}</td><td style={mono}>{it.params.map((p) => p.name + (p.optional ? "?" : "")).join(", ") || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}><button onClick={() => onUse(it.name)}>Code</button> <button onClick={() => edit(it)}>Modifier</button> <button disabled={busy} onClick={() => remove(it)}>Supprimer</button></td>
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
            <label>Table <select value={table} onChange={(e) => { setTable(e.target.value); setColumns([]); setFilters([]); setGroups([]); setSets([]); setOrderBy(""); setAggs([{ fn: "count", col: "", as: "" }]); setResult(null); }}>{tables.map((x) => <option key={x.table} value={x.table}>{x.table}</option>)}</select></label>
          </div>
          <div style={box}><label style={{ flex: 1 }}>Description <input style={{ width: "100%" }} maxLength={200} value={description} placeholder="À quoi sert cette route ? (apparaît dans la documentation)" onChange={(e) => setDescription(e.target.value)} /></label></div>

          {mode === "query" && (
            <div style={{ margin: "8px 0" }}>
              <b>Colonnes à renvoyer</b> <span className="muted">(aucune cochée = toutes)</span>
              <div style={box}>{readable.map((c) => <label key={c} style={{ marginRight: 8 }}><input type="checkbox" checked={columns.includes(c)} onChange={(e) => setColumns(e.target.checked ? [...columns, c] : columns.filter((x) => x !== c))} /> {c}</label>)}</div>
            </div>
          )}

          {mode === "aggregate" && (
            <>
              <div style={{ margin: "8px 0" }}>
                <b>Regrouper par</b> <span className="muted">(facultatif : par client, par mois…)</span>
                {groups.map((g, i) => (
                  <div key={i} style={box}>{colSelect(readable, g.col, (c) => setGroups(upd(groups, i, { col: c })))}
                    <select value={g.part} onChange={(e) => setGroups(upd(groups, i, { part: e.target.value }))}>{PARTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    <button onClick={() => setGroups(groups.filter((_, k) => k !== i))}>✕</button></div>
                ))}
                <button onClick={() => setGroups([...groups, { col: readable[0] ?? "", part: "" }])}>+ Regroupement</button>
              </div>
              <div style={{ margin: "8px 0" }}>
                <b>Calculs</b>
                {aggs.map((a, i) => (
                  <div key={i} style={box}>
                    <select value={a.fn} onChange={(e) => setAggs(upd(aggs, i, { fn: e.target.value, col: e.target.value === "count" ? "" : a.col }))}>{FNS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    {a.fn !== "count" && colSelect(a.fn === "sum" || a.fn === "avg" ? readable.filter((c) => isNumericType(typeOf(c))) : readable, a.col, (c) => setAggs(upd(aggs, i, { col: c })))}
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
              <b>Filtres</b> <span className="muted">(toutes les conditions doivent être vraies)</span>
              {filters.map((f, i) => (
                <div key={i} style={box}>
                  {colSelect(readable, f.col, (c) => setFilters(upd(filters, i, { col: c })))}
                  <select value={f.op} onChange={(e) => setFilters(upd(filters, i, { op: e.target.value }))}>{OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  {f.op !== "isnull" && f.op !== "notnull" && (<>
                    <select value={f.kind} onChange={(e) => setFilters(upd(filters, i, { kind: e.target.value as "value" | "param", text: "" }))}><option value="value">valeur fixe</option><option value="param">paramètre (fourni à l'appel)</option></select>
                    <input style={f.kind === "param" ? mono : undefined} value={f.text} placeholder={f.kind === "param" ? paramName(f.col || "valeur") : "valeur"} onChange={(e) => setFilters(upd(filters, i, { text: e.target.value }))} />
                    {f.kind === "param" && <label><input type="checkbox" checked={f.optional} onChange={(e) => setFilters(upd(filters, i, { optional: e.target.checked }))} /> facultatif</label>}
                  </>)}
                  <button onClick={() => setFilters(filters.filter((_, k) => k !== i))}>✕</button>
                </div>
              ))}
              <button onClick={() => setFilters([...filters, { col: readable[0] ?? "", op: "eq", kind: "value", text: "", optional: false }])} disabled={!readable.length}>+ Filtre</button>
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
