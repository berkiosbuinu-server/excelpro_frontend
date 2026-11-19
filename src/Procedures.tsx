import { useState } from "react";
import { queriesApi } from "./hosting";
import { columnsOf, type DataTable, type SavedItem } from "./dataops";
import { CALC, CMP, declaredIn, fromProcedureDef, stepEmpty, toProcedureDef, vEmpty, type PParam, type PStep, type ProcedureDef, type V } from "./procedures";

const NAME_RE = /^[a-z][a-z0-9-]{1,39}$/;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erreur inconnue");
const row = { padding: "4px 0", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" } as const;
const mono = { fontFamily: "Consolas, monospace", fontSize: 12 } as const;
const TYPES: [string, string][] = [["text", "texte"], ["number", "nombre"], ["date", "date"], ["bool", "oui/non"], ["list", "liste de lignes"]];
const STEPS: [PStep["type"], string][] = [["check", "Vérifier une condition"], ["get", "Lire une ligne (et la verrouiller)"], ["insert", "Ajouter une ligne"], ["update", "Modifier une ligne"], ["delete", "Supprimer une ligne"], ["each", "Pour chaque ligne de la liste…"]];
const upd = <T extends object>(list: T[], i: number, patch: Partial<T>): T[] => list.map((x, k) => (k === i ? { ...x, ...patch } : x));

type Scope = { params: PParam[]; refs: string[]; items: string[] | null };

/** Choix d'une valeur : fixe, paramètre, résultat d'une étape précédente, ou petit calcul. */
function ValueEd({ v, on, scope, simple = false }: { v: V; on: (v: V) => void; scope: Scope; simple?: boolean }) {
  const scalars = scope.params.filter((p) => p.type !== "list" && p.name.trim());
  const refs = [...(scope.items ? scope.items.map((f) => `item.${f}`) : []), ...scope.refs];
  return (
    <span style={row}>
      <select value={v.k} onChange={(e) => on({ ...vEmpty(e.target.value as V["k"]), op: "add", a: vEmpty(), b: vEmpty() })}>
        <option value="value">valeur fixe</option><option value="param">paramètre</option><option value="ref">résultat d'étape / ligne</option>{!simple && <option value="calc">calcul</option>}
      </select>
      {v.k === "value" && <input style={{ width: 110 }} value={v.text} placeholder="valeur" onChange={(e) => on({ ...v, text: e.target.value })} />}
      {v.k === "param" && <select value={v.text} onChange={(e) => on({ ...v, text: e.target.value })}><option value="">—</option>{scalars.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}</select>}
      {v.k === "ref" && <select value={v.text} onChange={(e) => on({ ...v, text: e.target.value })}><option value="">—</option>{refs.map((r) => <option key={r} value={r}>{r}</option>)}</select>}
      {v.k === "calc" && (<>
        <ValueEd v={v.a ?? vEmpty()} on={(a) => on({ ...v, a })} scope={scope} simple />
        <select value={v.op ?? "add"} onChange={(e) => on({ ...v, op: e.target.value })}>{CALC.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <ValueEd v={v.b ?? vEmpty()} on={(b) => on({ ...v, b })} scope={scope} simple />
      </>)}
    </span>
  );
}

function Steps({ steps, set, tables, scope, params, depth }: { steps: PStep[]; set: (s: PStep[]) => void; tables: DataTable[]; scope: Scope; params: PParam[]; depth: number }) {
  const colsOf = (t: string) => { const tb = tables.find((x) => x.table === t); return tb ? columnsOf(tb).filter((c) => !c.readOnly || c.name === tb.primaryKey).map((c) => c.name) : []; };
  const refsFor = (i: number) => {
    const before = declaredIn(steps.slice(0, i)), out = [...scope.refs];
    for (const d of before) for (const c of (() => { const tb = tables.find((x) => x.table === d.table); return tb ? [...columnsOf(tb).map((c) => c.name), "_berkios_version"] : []; })()) out.push(`${d.id}.${c}`);
    return out;
  };
  return (
    <div>
      {steps.map((s, i) => {
        const sc: Scope = { ...scope, refs: refsFor(i) }, tb = tables.find((x) => x.table === s.table);
        const patch = (p: Partial<PStep>) => set(upd(steps, i, p));
        const move = (d: number) => { const j = i + d; if (j < 0 || j >= steps.length) return; const c = [...steps]; [c[i], c[j]] = [c[j], c[i]]; set(c); };
        return (
          <div key={i} style={{ borderLeft: "3px solid var(--line)", paddingLeft: 10, margin: "8px 0" }}>
            <div style={row}>
              <b>{depth ? `${i + 1}` : `Étape ${i + 1}`}</b>
              <select value={s.type} onChange={(e) => set(upd(steps, i, { ...stepEmpty(e.target.value as PStep["type"]), id: s.id }))}>{STEPS.filter(([k]) => !(k === "each" && depth > 0)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              {(s.type === "get" || s.type === "insert" || s.type === "update") && <label>nom de l'étape <input style={{ ...mono, width: 90 }} value={s.id} placeholder="ex. produit" onChange={(e) => patch({ id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} /></label>}
              <button onClick={() => move(-1)} disabled={i === 0}>↑</button><button onClick={() => move(1)} disabled={i === steps.length - 1}>↓</button><button onClick={() => set(steps.filter((_, k) => k !== i))}>✕</button>
            </div>
            {["get", "insert", "update", "delete"].includes(s.type) && <div style={row}>Table <select value={s.table} onChange={(e) => patch({ table: e.target.value, set: [] })}><option value="">—</option>{tables.map((x) => <option key={x.table} value={x.table}>{x.table}</option>)}</select></div>}
            {["get", "update", "delete"].includes(s.type) && s.table && <div style={row}>Ligne de clé ({tb?.primaryKey}) = <ValueEd v={s.key} on={(key) => patch({ key })} scope={sc} /></div>}
            {s.type === "get" && <label><input type="checkbox" checked={s.required} onChange={(e) => patch({ required: e.target.checked })} /> refuser si la ligne n'existe pas</label>}
            {(s.type === "insert" || s.type === "update") && s.table && (
              <div>
                {s.set.map((x, k) => {
                  const secret = Boolean(tb?.fields.find((f) => f.name === x.col)?.secret);
                  return (
                    <div key={k} style={row}>
                      <select value={x.col} onChange={(e) => patch({ set: upd(s.set, k, { col: e.target.value }) })}><option value="">— colonne —</option>{colsOf(s.table).filter((c) => !(s.type === "update" && c === tb?.primaryKey)).map((c) => <option key={c} value={c}>{c}</option>)}</select>
                      {s.type === "update" ? <select value={x.mode} onChange={(e) => patch({ set: upd(s.set, k, { mode: e.target.value as "to" | "add" }) })}><option value="to">devient</option><option value="add">augmente de</option></select> : <span>=</span>}
                      <ValueEd v={x.v} on={(v) => patch({ set: upd(s.set, k, { v }) })} scope={sc} />
                      {secret && <span className="muted">🔒 protégé : valeur = paramètre</span>}
                      <button onClick={() => patch({ set: s.set.filter((_, m) => m !== k) })}>✕</button>
                    </div>
                  );
                })}
                <button onClick={() => patch({ set: [...s.set, { col: "", mode: "to", v: vEmpty() }] })}>+ Valeur à écrire</button>
                {s.type === "update" && <span className="muted"> « augmente de » : pour un stock, saisissez un calcul (ex. quantité × −1).</span>}
              </div>
            )}
            {s.type === "check" && (
              <div>
                <div style={row}>Continuer seulement si <ValueEd v={s.left} on={(left) => patch({ left })} scope={sc} />
                  <select value={s.cmp} onChange={(e) => patch({ cmp: e.target.value })}>{CMP.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  {s.cmp !== "isnull" && s.cmp !== "notnull" && <ValueEd v={s.right} on={(right) => patch({ right })} scope={sc} />}</div>
                <label>Sinon, tout est annulé avec le message <input style={{ width: 260 }} maxLength={200} value={s.message} placeholder="Stock insuffisant" onChange={(e) => patch({ message: e.target.value })} /></label>
              </div>
            )}
            {s.type === "each" && (
              <div>
                <div style={row}>Pour chaque ligne de <select value={s.over} onChange={(e) => patch({ over: e.target.value })}><option value="">—</option>{params.filter((p) => p.type === "list" && p.name.trim()).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}</select></div>
                <Steps steps={s.steps} set={(st) => patch({ steps: st })} tables={tables} params={params} depth={depth + 1} scope={{ ...sc, items: (params.find((p) => p.name === s.over)?.fields ?? "").split(/[,\s;]+/).filter(Boolean) }} />
              </div>
            )}
          </div>
        );
      })}
      <div style={row}>{STEPS.filter(([k]) => !(k === "each" && depth > 0)).map(([k, l]) => <button key={k} onClick={() => set([...steps, stepEmpty(k)])}>+ {l}</button>)}</div>
    </div>
  );
}

/** Constructeur de procédure : paramètres, étapes, essai de sauvegarde. Le serveur valide tout et exécute en une transaction. */
export function ProcedureBuilder({ importId, tables, item, onDone, onCancel }: { importId: string; tables: DataTable[]; item?: SavedItem; onDone: (name: string) => Promise<void>; onCancel: () => void }) {
  const init = item ? fromProcedureDef(item.def as unknown as ProcedureDef) : { description: "", params: [], steps: [], returns: [] as string[] };
  const [name, setName] = useState(item?.name ?? ""); const [description, setDescription] = useState(init.description);
  const [params, setParams] = useState<PParam[]>(init.params); const [steps, setSteps] = useState<PStep[]>(init.steps); const [returns, setReturns] = useState<string[]>(init.returns);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const ids = [...new Set(declaredIn(steps).map((d) => d.id))];
  const save = async () => {
    setBusy(true); setError("");
    try {
      if (!NAME_RE.test(name)) throw new Error("Nom invalide : 2 à 40 caractères, minuscules, chiffres et tirets, en commençant par une lettre (ex. creer-facture).");
      await queriesApi.save(importId, name, "procedure", toProcedureDef(description, params, steps, returns.filter((r) => ids.includes(r))));
      await onDone(name);
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="card">
      <h4 style={{ marginTop: 0 }}>Procédure (plusieurs étapes, une seule transaction)</h4>
      <p className="muted">Le serveur exécute les étapes dans l'ordre. Si une vérification échoue ou si une étape est refusée, <b>rien n'est écrit</b>. Exemple : vérifier le stock → créer la facture → ajouter les lignes → baisser le stock.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div style={row}>
        <label>Nom de la route <input value={name} disabled={Boolean(item)} maxLength={40} placeholder="creer-facture" onChange={(e) => setName(e.target.value.toLowerCase())} style={mono} /></label>
        <label style={{ flex: 1 }}>Description <input style={{ width: "100%" }} maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      </div>
      <b>Paramètres d'appel</b> <span className="muted">(ce que l'appelant fournit ; une « liste de lignes » reçoit les lignes de la facture, d'une plage Excel)</span>
      {params.map((p, i) => (
        <div key={i} style={row}>
          <input style={{ ...mono, width: 120 }} value={p.name} placeholder="nom" onChange={(e) => setParams(upd(params, i, { name: e.target.value.replace(/[^a-z0-9_]/gi, "").slice(0, 30) }))} />
          <select value={p.type} onChange={(e) => setParams(upd(params, i, { type: e.target.value as PParam["type"] }))}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          {p.type === "list" && <input style={{ ...mono, width: 220 }} value={p.fields} placeholder="champs : produit, quantite" onChange={(e) => setParams(upd(params, i, { fields: e.target.value }))} />}
          <label><input type="checkbox" checked={p.required} onChange={(e) => setParams(upd(params, i, { required: e.target.checked }))} /> obligatoire</label>
          <button onClick={() => setParams(params.filter((_, k) => k !== i))}>✕</button>
        </div>
      ))}
      <div><button onClick={() => setParams([...params, { name: "", type: "text", required: true, fields: "" }])} disabled={params.length >= 20}>+ Paramètre</button></div>
      <div style={{ margin: "10px 0" }}><b>Étapes</b>
        <Steps steps={steps} set={setSteps} tables={tables} params={params} depth={0} scope={{ params, refs: [], items: null }} />
      </div>
      {ids.length > 0 && (
        <div style={row}><b>Résultat renvoyé :</b> {ids.map((id) => <label key={id}><input type="checkbox" checked={returns.includes(id)} onChange={(e) => setReturns(e.target.checked ? [...returns, id] : returns.filter((r) => r !== id))} /> {id}</label>)}<span className="muted">(rien de coché = toutes les étapes nommées)</span></div>
      )}
      <div style={row}><button className="primary" disabled={busy} onClick={() => void save()}>Enregistrer</button><button disabled={busy} onClick={onCancel}>Annuler</button></div>
    </div>
  );
}
