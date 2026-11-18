import { useCallback, useEffect, useState } from "react";
import { policyApi } from "./hosting";
import { authTarget } from "./generate";
import type { DataTable, Policy, RoleRights, RowRule, SavedItem } from "./dataops";

const OPS: [string, string][] = [["read", "Lire"], ["create", "Ajouter"], ["update", "Modifier"], ["delete", "Supprimer"]];
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erreur inconnue");
const empty = (): RoleRights => ({ tables: {}, queries: [], actions: [], rows: {} });
const toggle = (list: string[], v: string, on: boolean) => (on ? [...new Set([...list, v])] : list.filter((x) => x !== v));
const box = { padding: "4px 0", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" } as const;

/** Droits par rôle : quelles tables chaque type d'utilisateur peut lire/modifier, quelles requêtes et actions il peut lancer. */
export function Rights({ importId, tables, items }: { importId: string; tables: DataTable[]; items: SavedItem[] }) {
  const [policy, setPolicy] = useState<Policy>({ roles: {} });
  const [active, setActive] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [info, setInfo] = useState("");
  const target = authTarget(tables);
  const userTable = tables.find((t) => t.table === target?.table);
  const roleCols = userTable ? userTable.fields.filter((f) => !f.secret).map((f) => f.name) : [];
  const queries = items.filter((i) => i.valid && i.kind === "query"), actions = items.filter((i) => i.valid && i.kind === "action");

  const load = useCallback(async () => {
    try { setError(""); const p = await policyApi.get(importId); setActive(p !== null); setPolicy(p ?? { roleColumn: roleCols.find((c) => /^(role|profil|droit|type)/i.test(c)) ?? "", roles: {} }); }
    catch (e) { setError(errMsg(e)); }
  }, [importId]);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(""); setInfo(""); try { await fn(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); } };
  const setRole = (name: string, r: RoleRights) => setPolicy({ ...policy, roles: { ...policy.roles, [name]: r } });
  const preset = (name: string, kind: string) => {
    const all = Object.fromEntries([["*", kind === "all" ? OPS.map(([o]) => o) : kind === "entry" ? ["read", "create"] : ["read"]]]);
    setRole(name, { tables: all, queries: kind === "all" || kind === "read" ? ["*"] : [], actions: kind === "all" ? ["*"] : [], rows: {} });
  };
  const save = () => run(async () => {
    const p: Policy = { roles: policy.roles, ...(policy.roleSource ? { roleSource: policy.roleSource } : policy.roleColumn ? { roleColumn: policy.roleColumn } : {}) };
    await policyApi.save(importId, p); setActive(true); setInfo("Droits enregistrés. Ils s'appliquent tout de suite aux utilisateurs déjà connectés qui ont un rôle ; ceux qui se sont connectés AVANT la première activation des droits doivent se reconnecter.");
  });

  if (!target) return <p className="muted">Les droits par rôle s'appliquent aux utilisateurs qui se connectent avec un mot de passe : ce classeur n'a pas de table avec un champ protégé (mot de passe).</p>;
  return (
    <div>
      <p className="muted">Définissez ce que chaque type d'utilisateur (rôle) peut faire <b>après connexion</b>. {active ? <b>Les droits sont actifs : tout ce qui n'est pas autorisé est refusé.</b> : <b>Aucune restriction pour l'instant : un utilisateur connecté peut tout lire et écrire.</b>} Les clés d'API ne sont pas concernées.</p>
      {error && <p className="error" role="alert">{error}</p>}{info && <p className="ok">{info}</p>}
      <div style={box}>
        <b>Où est le rôle de l'utilisateur ?</b>
        <label><input type="radio" checked={!policy.roleSource} onChange={() => setPolicy({ roles: policy.roles, roleColumn: roleCols[0] ?? "" })} /> dans la table des utilisateurs</label>
        <label><input type="radio" checked={Boolean(policy.roleSource)} onChange={() => { const t0 = tables.find((t) => t.table !== target.table) ?? tables[0]; const c0 = t0.fields.filter((f) => !f.secret).map((f) => f.name); setPolicy({ roles: policy.roles, roleSource: { table: t0.table, match: c0[0] ?? "", column: c0[1] ?? c0[0] ?? "" } }); }} /> dans une autre table</label>
      </div>
      {!policy.roleSource && (
        <div style={box}>
          <label>Colonne du rôle{" "}
            <select value={policy.roleColumn ?? ""} onChange={(e) => setPolicy({ ...policy, roleColumn: e.target.value })}>
              <option value="">— aucune —</option>{roleCols.map((c) => <option key={c} value={c}>{userTable?.table}.{c}</option>)}
            </select></label>
          <span className="muted">(ex. « admin », « vendeur », « invité »)</span>
        </div>
      )}
      {policy.roleSource && (() => {
        const rs = policy.roleSource, st = tables.find((t) => t.table === rs.table), sc = st ? st.fields.filter((f) => !f.secret).map((f) => f.name) : [];
        return (
          <div style={box}>
            <label>Table <select value={rs.table} onChange={(e) => { const t1 = tables.find((t) => t.table === e.target.value); const c1 = t1 ? t1.fields.filter((f) => !f.secret).map((f) => f.name) : []; setPolicy({ ...policy, roleSource: { table: e.target.value, match: c1[0] ?? "", column: c1[1] ?? c1[0] ?? "" } }); }}>{tables.map((t) => <option key={t.table} value={t.table}>{t.table}</option>)}</select></label>
            <label>dont la colonne <select value={rs.match} onChange={(e) => setPolicy({ ...policy, roleSource: { ...rs, match: e.target.value } })}>{sc.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
            <span>contient l'identifiant de connexion, et la colonne</span>
            <select value={rs.column} onChange={(e) => setPolicy({ ...policy, roleSource: { ...rs, column: e.target.value } })}>{sc.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <span>contient le rôle.</span>
          </div>
        );
      })()}

      {Object.entries(policy.roles).map(([name, r]) => (
        <div key={name} className="card" style={{ marginTop: 10 }}>
          <div style={box}>
            <b>{name === "*" ? "Tous les autres rôles (par défaut)" : `Rôle « ${name} »`}</b>
            <select value="" onChange={(e) => e.target.value && preset(name, e.target.value)}>
              <option value="">Remplir avec…</option><option value="all">Tous les droits</option><option value="entry">Saisie (lire + ajouter)</option><option value="read">Lecture seule</option>
            </select>
            <button onClick={() => { const { [name]: _drop, ...rest } = policy.roles; setPolicy({ ...policy, roles: rest }); }}>Retirer ce rôle</button>
          </div>
          <table style={{ borderCollapse: "collapse" }}>
            <thead><tr><th style={{ textAlign: "left", paddingRight: 16 }}>Table</th>{OPS.map(([o, l]) => <th key={o} style={{ paddingRight: 12 }}>{l}</th>)}</tr></thead>
            <tbody>{["*", ...tables.map((t) => t.table)].map((t) => (
              <tr key={t}><td style={{ paddingRight: 16 }}>{t === "*" ? "Toutes les autres tables" : t}</td>
                {OPS.map(([o]) => <td key={o} style={{ textAlign: "center" }}><input type="checkbox" checked={(r.tables[t] ?? []).includes(o)} onChange={(e) => setRole(name, { ...r, tables: { ...r.tables, [t]: toggle(r.tables[t] ?? [], o, e.target.checked) } })} /></td>)}</tr>
            ))}</tbody>
          </table>
          <div style={{ margin: "6px 0" }}>
            <b>Lignes visibles</b> <span className="muted">(par défaut : toutes ; sinon seulement les lignes qui appartiennent à l'utilisateur)</span>
            {tables.map((t) => {
              const rule: RowRule | undefined = r.rows?.[t.table], cols = t.fields.filter((f) => !f.secret).map((f) => f.name);
              const kind = !rule ? "" : rule.value === "$user" ? "user" : rule.value.startsWith("$user.") ? "attr" : "fixed";
              const setRule = (next: RowRule | null) => { const rest = { ...(r.rows ?? {}) }; if (next) rest[t.table] = next; else delete rest[t.table]; setRole(name, { ...r, rows: rest }); };
              return (
                <div key={t.table} style={box}>
                  <span style={{ minWidth: 110 }}>{t.table}</span>
                  <select value={kind === "" ? "" : "on"} onChange={(e) => setRule(e.target.value ? { col: cols[0] ?? "", value: "$user" } : null)}><option value="">Toutes les lignes</option><option value="on">Seulement les lignes dont…</option></select>
                  {rule && (<>
                    <select value={rule.col} onChange={(e) => setRule({ ...rule, col: e.target.value })}>{cols.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                    <span>=</span>
                    <select value={kind} onChange={(e) => setRule({ ...rule, value: e.target.value === "user" ? "$user" : e.target.value === "attr" ? `$user.${userTable?.fields.find((f) => !f.secret)?.name ?? "nom"}` : "" })}>
                      <option value="user">l'identifiant de connexion</option><option value="attr">une valeur de la fiche de l'utilisateur</option><option value="fixed">une valeur fixe</option>
                    </select>
                    {kind === "attr" && <select value={rule.value.slice(6)} onChange={(e) => setRule({ ...rule, value: `$user.${e.target.value}` })}>{roleCols.map((c) => <option key={c} value={c}>{userTable?.table}.{c}</option>)}</select>}
                    {kind === "fixed" && <input value={rule.value} placeholder="valeur" onChange={(e) => setRule({ ...rule, value: e.target.value })} />}
                  </>)}
                </div>
              );
            })}
          </div>
          <div style={box}><b>Requêtes autorisées</b>
            <label><input type="checkbox" checked={r.queries.includes("*")} onChange={(e) => setRole(name, { ...r, queries: e.target.checked ? ["*"] : [] })} /> toutes</label>
            {!r.queries.includes("*") && queries.map((q) => <label key={q.name}><input type="checkbox" checked={r.queries.includes(q.name)} onChange={(e) => setRole(name, { ...r, queries: toggle(r.queries, q.name, e.target.checked) })} /> {q.name}</label>)}
            {!queries.length && <span className="muted">aucune requête créée</span>}</div>
          <div style={box}><b>Actions autorisées</b>
            <label><input type="checkbox" checked={r.actions.includes("*")} onChange={(e) => setRole(name, { ...r, actions: e.target.checked ? ["*"] : [] })} /> toutes</label>
            {!r.actions.includes("*") && actions.map((a) => <label key={a.name}><input type="checkbox" checked={r.actions.includes(a.name)} onChange={(e) => setRole(name, { ...r, actions: toggle(r.actions, a.name, e.target.checked) })} /> {a.name}</label>)}
            {!actions.length && <span className="muted">aucune action créée</span>}</div>
        </div>
      ))}

      <div style={{ ...box, marginTop: 10 }}>
        <input placeholder="Nom du rôle (ex. admin)" value={newRole} maxLength={40} onChange={(e) => setNewRole(e.target.value.toLowerCase())} />
        <button disabled={!newRole.trim() || newRole.trim() in policy.roles} onClick={() => { setRole(newRole.trim(), empty()); setNewRole(""); }}>+ Ajouter ce rôle</button>
        <button disabled={"*" in policy.roles} onClick={() => setRole("*", empty())}>+ Rôle par défaut</button>
      </div>
      <div style={box}>
        <button className="primary" disabled={busy} onClick={() => void save()}>Enregistrer les droits</button>
        {active && <button disabled={busy} onClick={() => { if (window.confirm("Supprimer toutes les restrictions ? Tout utilisateur connecté pourra lire et écrire sur tout le classeur.")) void run(async () => { await policyApi.remove(importId); setInfo("Restrictions supprimées."); await load(); }); }}>Supprimer les restrictions</button>}
      </div>
      <p className="muted">Les restrictions de lignes s'appliquent partout : lecture, export, modification, suppression, requêtes, calculs et actions. Une ligne créée par un utilisateur restreint lui est attribuée automatiquement. Le rôle est lu au moment de la connexion. Un changement de rôle d'un utilisateur s'applique à sa prochaine connexion.</p>
    </div>
  );
}
