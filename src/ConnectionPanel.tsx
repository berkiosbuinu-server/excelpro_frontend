import { useCallback, useEffect, useState } from "react";
import { keysApi, serverBase, dataApi, type ApiKey, type NewApiKey } from "./hosting";
import { curlExample, dataBase, KEY_PLACEHOLDER, powerQuery, vbaModule } from "./snippets";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erreur inconnue");
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR") : "jamais");

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** Relier le classeur (Power Query, macro VBA, application) aux données hébergées, avec des clés d'API révocables. */
export function ConnectionPanel({ importId }: { importId: string }) {
  const [base, setBase] = useState("");
  const [tables, setTables] = useState<string[]>([]);
  const [table, setTable] = useState("");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<"rw" | "ro">("rw");
  const [fresh, setFresh] = useState<NewApiKey | null>(null);
  const [tab, setTab] = useState<"pq" | "vba" | "curl">("pq");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [info, setInfo] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const [b, k, s] = await Promise.all([serverBase(), keysApi.list(importId), dataApi.schema(importId)]);
      setBase(dataBase(b, importId)); setKeys(k); setTables(s.tables.map((t) => t.table)); setTable((cur) => cur || s.tables[0]?.table || "");
    } catch (e) { setError(errMsg(e)); }
  }, [importId]);
  useEffect(() => { setFresh(null); void load(); }, [load]);

  const create = async () => {
    setBusy(true); setError(""); setInfo("");
    try { const k = await keysApi.create(importId, label.trim() || "Clé d'API", scope); setFresh(k); setLabel(""); await load(); }
    catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  const revoke = async (k: ApiKey) => {
    if (!window.confirm(`Révoquer la clé « ${k.label} » ? Tout ce qui l'utilise cessera de fonctionner immédiatement.`)) return;
    setBusy(true); setError("");
    try { await keysApi.revoke(importId, k.id); if (fresh?.id === k.id) setFresh(null); setInfo("Clé révoquée."); await load(); }
    catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  const doCopy = async (text: string, what: string) => setInfo((await copy(text)) ? `${what} copié.` : "Copie impossible : sélectionnez le texte et copiez-le (Ctrl+C).");

  const key = fresh?.key ?? KEY_PLACEHOLDER;
  const snippet = !base || !table ? "" : tab === "pq" ? powerQuery(base, table, key) : tab === "vba" ? vbaModule(base, key) : curlExample(base, table, key);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>Connexion : relier votre classeur Excel</h3>
      <p className="muted">Une clé d'API permet à un classeur, une macro ou une application de lire et d'écrire ces données sans se connecter. Elle ne donne accès qu'à ce classeur hébergé.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {info && <p className="ok">{info}</p>}

      <b>Adresse des données</b>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <code style={{ wordBreak: "break-all" }}>{base || "…"}</code>
        <button disabled={!base} onClick={() => void doCopy(base, "Adresse")}>Copier</button>
      </div>

      <h4 style={{ marginBottom: 4 }}>Clés d'API</h4>
      {keys.length === 0 ? <p className="muted">Aucune clé. Créez-en une ci-dessous.</p> : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr><th style={{ textAlign: "left" }}>Nom</th><th style={{ textAlign: "left" }}>Droits</th><th style={{ textAlign: "left" }}>Créée</th><th style={{ textAlign: "left" }}>Dernier usage</th><th /></tr></thead>
          <tbody>{keys.map((k) => (
            <tr key={k.id}>
              <td>{k.label}</td><td>{k.scope === "rw" ? "Lecture et écriture" : "Lecture seule"}</td><td>{fmt(k.createdAt)}</td><td>{fmt(k.lastUsedAt)}</td>
              <td><button disabled={busy} onClick={() => void revoke(k)}>Révoquer</button></td>
            </tr>))}
          </tbody>
        </table>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
        <input placeholder="Nom (ex. Facture automatisée)" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
        <select value={scope} onChange={(e) => setScope(e.target.value as "rw" | "ro")}>
          <option value="rw">Lecture et écriture</option>
          <option value="ro">Lecture seule</option>
        </select>
        <button className="primary" disabled={busy} onClick={() => void create()}>+ Créer une clé</button>
      </div>

      {fresh && (
        <div className="card" style={{ marginTop: 12, borderColor: "#b54708" }}>
          <b>Votre nouvelle clé : copiez-la maintenant</b>
          <p className="warn">Elle ne sera plus jamais affichée. Gardez-la comme un mot de passe ; si elle fuit, révoquez-la ici.</p>
          <code style={{ wordBreak: "break-all" }}>{fresh.key}</code>
          <div><button onClick={() => void doCopy(fresh.key, "Clé")}>Copier la clé</button> <button onClick={() => setFresh(null)}>J'ai copié la clé</button></div>
        </div>
      )}

      <h4 style={{ marginBottom: 4 }}>Exemples prêts à coller</h4>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className={tab === "pq" ? "primary" : ""} onClick={() => setTab("pq")}>Power Query (Excel)</button>
        <button className={tab === "vba" ? "primary" : ""} onClick={() => setTab("vba")}>Macro VBA</button>
        <button className={tab === "curl" ? "primary" : ""} onClick={() => setTab("curl")}>curl</button>
        {tab !== "vba" && <select value={table} onChange={(e) => setTable(e.target.value)}>{tables.map((t) => <option key={t} value={t}>{t}</option>)}</select>}
      </div>
      {tab === "pq" && <p className="muted">Excel : Données → Obtenir des données → Autres sources → Requête vide → Éditeur avancé, collez, puis « Fermer et charger ». Si Excel demande des identifiants, choisissez « Anonyme ». La clé est enregistrée dans le classeur.</p>}
      {tab === "vba" && <p className="muted">Excel : Alt+F11 → Insertion → Module, collez, enregistrez le classeur en .xlsm. Ensuite : <code>BK_LoadTable "table", Sheets("Feuille1").Range("A1")</code>.</p>}
      {key === KEY_PLACEHOLDER && <p className="warn">Créez une clé ci-dessus : elle sera insérée automatiquement dans l'exemple.</p>}
      <textarea readOnly value={snippet} rows={tab === "vba" ? 12 : 8} style={{ width: "100%", fontFamily: "Consolas, monospace", fontSize: 12 }} onFocus={(e) => e.currentTarget.select()} />
      <div><button disabled={!snippet} onClick={() => void doCopy(snippet, "Exemple")}>Copier l'exemple</button></div>
    </div>
  );
}
