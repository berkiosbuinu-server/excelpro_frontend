import { useCallback, useEffect, useState } from "react";
import { dataApi } from "./hosting";
import { columnsOf, fromCell, toCell, VERSION_COL, type DataRow, type DataTable, type Scalar } from "./dataops";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erreur inconnue");
const PAGE = 25;

/** Les lignes publiées d'un classeur : consulter, filtrer, ajouter, modifier, supprimer (protégé contre les modifications simultanées). */
export function DataBrowser({ importId }: { importId: string }) {
  const [tables, setTables] = useState<DataTable[]>([]);
  const [table, setTable] = useState<DataTable | null>(null);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" } | null>(null);
  const [filterCol, setFilterCol] = useState(""); const [filterVal, setFilterVal] = useState("");
  const [editing, setEditing] = useState<{ row: DataRow | null; form: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [info, setInfo] = useState("");

  useEffect(() => {
    setTables([]); setTable(null);
    dataApi.schema(importId).then((s) => { setTables(s.tables); setTable(s.tables[0] ?? null); }).catch((e) => setError(errMsg(e)));
  }, [importId]);

  const load = useCallback(async () => {
    if (!table) return;
    setBusy(true); setError("");
    try {
      const r = await dataApi.list(importId, table.table, { limit: PAGE, offset, orderBy: sort?.col, direction: sort?.dir, filters: filterCol && filterVal ? { [filterCol]: filterVal } : {} });
      setRows(r.data); setTotal(r.total);
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }, [importId, table, offset, sort, filterCol, filterVal]);
  useEffect(() => { void load(); }, [load]);

  if (!table) return <div className="card" style={{ marginTop: 16 }}><h3>Données publiées</h3>{error ? <p className="error">{error}</p> : <p className="muted">Chargement…</p>}</div>;
  const cols = columnsOf(table), keyOf = (r: DataRow) => String(r[table.primaryKey]);
  const secrets = table.fields.filter((f) => f.secret).map((f) => f.name);

  const openEditor = (row: DataRow | null) => {
    const form: Record<string, string> = {};
    for (const c of cols) if (!c.readOnly) form[c.name] = row ? String(toCell(row[c.name], c.type) === "" ? "" : toCell(row[c.name], c.type)) : "";
    for (const s of secrets) form[s] = ""; // mot de passe : vide = inchangé
    setEditing({ row, form }); setInfo(""); setError("");
  };
  const save = async () => {
    if (!editing) return;
    setBusy(true); setError("");
    try {
      const vals: Record<string, Scalar> = {};
      for (const c of cols) if (!c.readOnly) vals[c.name] = fromCell(editing.form[c.name], c.type);
      for (const s of secrets) if (editing.form[s]) vals[s] = editing.form[s];
      if (editing.row) {
        const changed: Record<string, Scalar> = {};
        for (const c of cols) if (!c.readOnly && c.name !== table.primaryKey && String(vals[c.name] ?? "") !== String(editing.row[c.name] ?? "")) changed[c.name] = vals[c.name];
        for (const s of secrets) if (vals[s]) changed[s] = vals[s];
        if (Object.keys(changed).length) await dataApi.update(importId, table.table, keyOf(editing.row), Number(editing.row[VERSION_COL]), changed);
      } else {
        const clean = Object.fromEntries(Object.entries(vals).filter(([, v]) => v !== null));
        await dataApi.insert(importId, table.table, clean);
      }
      setEditing(null); setInfo("Enregistré."); await load();
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  const del = async (r: DataRow) => {
    if (!window.confirm(`Supprimer la ligne « ${keyOf(r)} » ?`)) return;
    setBusy(true); setError("");
    try { await dataApi.remove(importId, table.table, keyOf(r), Number(r[VERSION_COL])); setInfo("Ligne supprimée."); await load(); }
    catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>Données publiées</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={table.table} onChange={(e) => { setTable(tables.find((t) => t.table === e.target.value) ?? null); setOffset(0); setSort(null); setFilterCol(""); setFilterVal(""); }}>
          {tables.map((t) => <option key={t.table} value={t.table}>{t.table}</option>)}
        </select>
        <select value={filterCol} onChange={(e) => { setFilterCol(e.target.value); setOffset(0); }}>
          <option value="">Filtrer par…</option>
          {cols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
        <input placeholder="valeur exacte" value={filterVal} disabled={!filterCol} onChange={(e) => { setFilterVal(e.target.value); setOffset(0); }} />
        <button disabled={busy} onClick={() => openEditor(null)}>+ Ajouter une ligne</button>
        <span className="muted">{total} ligne(s)</span>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {info && <p className="ok">{info}</p>}
      {secrets.length > 0 && <p className="muted">🔒 {secrets.join(", ")} : protégé(s), jamais affiché(s). À la modification, laissez vide pour ne pas changer.</p>}
      <div style={{ overflowX: "auto", marginTop: 8 }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr>
            {cols.map((c) => <th key={c.name} style={{ textAlign: "left", cursor: "pointer", padding: "4px 8px", borderBottom: "1px solid var(--line)" }} onClick={() => { setSort(sort?.col === c.name && sort.dir === "asc" ? { col: c.name, dir: "desc" } : { col: c.name, dir: "asc" }); setOffset(0); }}>{c.name}{sort?.col === c.name ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</th>)}
            <th />
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={keyOf(r)}>
                {cols.map((c) => <td key={c.name} style={{ padding: "4px 8px", borderBottom: "1px solid var(--line)" }}>{String(toCell(r[c.name], c.type))}</td>)}
                <td style={{ whiteSpace: "nowrap" }}><button disabled={busy} onClick={() => openEditor(r)}>Modifier</button> <button disabled={busy} onClick={() => void del(r)}>Supprimer</button></td>
              </tr>
            ))}
            {rows.length === 0 && !busy && <tr><td colSpan={cols.length + 1} className="muted" style={{ padding: 8 }}>Aucune ligne.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
        <button disabled={busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>← Précédent</button>
        <span className="muted">{total ? `${offset + 1}–${Math.min(offset + PAGE, total)} sur ${total}` : "0"}</span>
        <button disabled={busy || offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Suivant →</button>
      </div>

      {editing && (
        <div className="card" style={{ marginTop: 12 }}>
          <b>{editing.row ? `Modifier « ${keyOf(editing.row)} »` : "Nouvelle ligne"}</b>
          {cols.filter((c) => !c.readOnly && !(editing.row && c.name === table.primaryKey)).map((c) => (
            <label key={c.name} style={{ display: "block", margin: "6px 0" }}>{c.name} <span className="muted">({c.type})</span>
              <input value={editing.form[c.name] ?? ""} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, [c.name]: e.target.value } })} />
            </label>
          ))}
          {secrets.map((s) => (
            <label key={s} style={{ display: "block", margin: "6px 0" }}>🔒 {s}
              <input type="password" autoComplete="new-password" placeholder={editing.row ? "inchangé si vide" : ""} value={editing.form[s] ?? ""} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, [s]: e.target.value } })} />
            </label>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="primary" disabled={busy} onClick={() => void save()}>Enregistrer</button>
            <button disabled={busy} onClick={() => setEditing(null)}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}
