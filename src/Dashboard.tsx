import { useCallback, useEffect, useState } from "react";
import { DataBrowser } from "./DataBrowser";
import { Queries } from "./Queries";
import { dataApi, keysApi, queriesApi, serverBase, type ApiKey, type NewApiKey } from "./hosting";
import { columnsOf, type DataTable, type SavedItem } from "./dataops";
import { curlExample, dataBase, KEY_PLACEHOLDER, powerQuery } from "./snippets";
import { jsExample, pythonExample, rootOf, routesOf, savedExample, vbaApp, vbaUsage } from "./generate";

type Tab = "overview" | "tables" | "data" | "queries" | "api" | "routes" | "examples";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Vue d'ensemble" }, { id: "tables", label: "Tables" }, { id: "data", label: "Données" }, { id: "queries", label: "Requêtes" },
  { id: "api", label: "API & clés" }, { id: "routes", label: "Routes" }, { id: "examples", label: "Exemples" },
];
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erreur inconnue");
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR") : "jamais");
const mono = { fontFamily: "Consolas, monospace", fontSize: 12 } as const;

async function copy(text: string): Promise<boolean> { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

/** Tableau de bord d'un classeur hébergé : tout ce qu'il faut pour l'utiliser, généré automatiquement à partir de ses tables. */
export function Dashboard({ importId, fileName }: { importId: string; fileName: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [base, setBase] = useState("");
  const [tables, setTables] = useState<DataTable[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [saved, setSaved] = useState<SavedItem[]>([]); const [focus, setFocus] = useState("");
  const [fresh, setFresh] = useState<NewApiKey | null>(null);
  const [label, setLabel] = useState(""); const [scope, setScope] = useState<"rw" | "ro" | "auth">("rw");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [info, setInfo] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const [b, k, s, q] = await Promise.all([serverBase(), keysApi.list(importId), dataApi.schema(importId), queriesApi.list(importId)]);
      setBase(dataBase(b, importId)); setKeys(k); setTables(s.tables); setSaved(q);
      const c: Record<string, number> = {};
      await Promise.all(s.tables.map(async (t) => { c[t.table] = (await dataApi.list(importId, t.table, { limit: 1 })).total; }));
      setCounts(c);
    } catch (e) { setError(errMsg(e)); }
  }, [importId]);
  useEffect(() => { setFresh(null); setTab("overview"); void load(); }, [load]);

  const doCopy = async (text: string, what: string) => setInfo((await copy(text)) ? `${what} copié.` : "Copie impossible : sélectionnez le texte et copiez-le (Ctrl+C).");
  const act = async (fn: () => Promise<void>) => { setBusy(true); setError(""); setInfo(""); try { await fn(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); } };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>Tableau de bord — {fileName}</h3>
      <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap", borderBottom: "1px solid var(--line)", paddingBottom: 8, marginBottom: 12 }}>
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "primary" : ""} onClick={() => { setTab(t.id); setInfo(""); }}>{t.label}</button>)}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {info && <p className="ok">{info}</p>}

      {tab === "overview" && (
        <div>
          <p className="muted">Votre classeur est hébergé sur le serveur BERKIOS. Ses tables sont disponibles par une API générée automatiquement : lecture, ajout, modification et suppression, protégées contre les modifications simultanées.</p>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr><th style={{ textAlign: "left" }}>Table</th><th style={{ textAlign: "left" }}>Colonnes</th><th style={{ textAlign: "left" }}>Lignes</th><th /></tr></thead>
            <tbody>{tables.map((t) => (
              <tr key={t.table}><td><b>{t.table}</b></td><td>{columnsOf(t).length}</td><td>{counts[t.table] ?? "…"}</td><td><button onClick={() => setTab("data")}>Voir les données</button></td></tr>
            ))}</tbody>
          </table>
          <p style={{ marginTop: 12 }}>Clés d'API actives : <b>{keys.length}</b> — <button onClick={() => setTab("api")}>Gérer</button></p>
          <p className="muted">Pour relier Excel : onglet <b>Exemples</b> (Power Query, module VBA prêt à importer, JavaScript, Python).</p>
        </div>
      )}

      {tab === "tables" && (
        <div>
          {tables.map((t) => (
            <details key={t.table} style={{ marginBottom: 8 }}>
              <summary><b>{t.table}</b> — {t.fields.length} champ(s), clé : <code>{t.primaryKey}</code>{t.generatedPrimaryKey ? " (générée)" : ""}{counts[t.table] !== undefined ? `, ${counts[t.table]} ligne(s)` : ""}</summary>
              <table style={{ borderCollapse: "collapse", marginTop: 6 }}>
                <thead><tr><th style={{ textAlign: "left", paddingRight: 16 }}>Champ</th><th style={{ textAlign: "left", paddingRight: 16 }}>Type</th><th style={{ textAlign: "left", paddingRight: 16 }}>Obligatoire</th><th style={{ textAlign: "left" }}>Remarque</th></tr></thead>
                <tbody>{t.generatedPrimaryKey && <tr><td style={mono}>{t.primaryKey}</td><td>identifiant</td><td>—</td><td>généré par le serveur</td></tr>}
                  {t.fields.map((f) => (
                    <tr key={f.name}><td style={mono}>{f.name}</td><td>{f.type}</td><td>{f.nullable ? "non" : "oui"}</td><td>{f.secret ? "🔒 protégé : jamais affiché, haché à l'écriture" : f.name === t.primaryKey ? "clé" : ""}</td></tr>
                  ))}
                </tbody>
              </table>
            </details>
          ))}
        </div>
      )}

      {tab === "data" && <DataBrowser importId={importId} />}

      {tab === "api" && (
        <div>
          <b>Adresse de l'API de ce classeur</b>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <code style={{ wordBreak: "break-all" }}>{base || "…"}</code><button disabled={!base} onClick={() => void doCopy(base, "Adresse")}>Copier</button>
          </div>
          <p className="muted">Pour un classeur distribué à plusieurs utilisateurs, utilisez une clé « Connexion seulement » : elle ne peut que vérifier un mot de passe (sur le serveur) ; après connexion, l'utilisateur reçoit une session temporaire pour lire et écrire. Chaque requête envoie la clé dans l'en-tête <code>Authorization: Bearer &lt;clé&gt;</code>. Une clé ne donne accès qu'à ce classeur.</p>
          <h4 style={{ marginBottom: 4 }}>Clés d'API</h4>
          {keys.length === 0 ? <p className="muted">Aucune clé. Créez-en une ci-dessous.</p> : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={{ textAlign: "left" }}>Nom</th><th style={{ textAlign: "left" }}>Droits</th><th style={{ textAlign: "left" }}>Créée</th><th style={{ textAlign: "left" }}>Dernier usage</th><th /></tr></thead>
              <tbody>{keys.map((k) => (
                <tr key={k.id}><td>{k.label}</td><td>{k.scope === "rw" ? "Lecture et écriture" : k.scope === "ro" ? "Lecture seule" : "Connexion seulement"}</td><td>{fmt(k.createdAt)}</td><td>{fmt(k.lastUsedAt)}</td>
                  <td><button disabled={busy} onClick={() => { if (window.confirm(`Révoquer la clé « ${k.label} » ? Tout ce qui l'utilise cessera de fonctionner immédiatement.`)) void act(async () => { await keysApi.revoke(importId, k.id); if (fresh?.id === k.id) setFresh(null); setInfo("Clé révoquée."); await load(); }); }}>Révoquer</button></td></tr>
              ))}</tbody>
            </table>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
            <input placeholder="Nom (ex. Facture automatisée)" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
            <select value={scope} onChange={(e) => setScope(e.target.value as "rw" | "ro" | "auth")}><option value="rw">Lecture et écriture</option><option value="ro">Lecture seule</option><option value="auth">Connexion seulement (recommandé pour un classeur distribué)</option></select>
            <button className="primary" disabled={busy} onClick={() => void act(async () => { const k = await keysApi.create(importId, label.trim() || "Clé d'API", scope); setFresh(k); setLabel(""); await load(); })}>+ Créer une clé</button>
          </div>
          {fresh && (
            <div className="card" style={{ marginTop: 12, borderColor: "#b54708" }}>
              <b>Votre nouvelle clé : copiez-la maintenant</b>
              <p className="warn">Elle ne sera plus jamais affichée. Gardez-la comme un mot de passe ; si elle fuit, révoquez-la ici. Elle est insérée automatiquement dans les exemples tant que cette page reste ouverte.</p>
              <code style={{ wordBreak: "break-all" }}>{fresh.key}</code>
              <div><button onClick={() => void doCopy(fresh.key, "Clé")}>Copier la clé</button> <button onClick={() => setTab("examples")}>Voir les exemples</button></div>
            </div>
          )}
        </div>
      )}

      {tab === "queries" && <Queries importId={importId} tables={tables} items={saved} onChanged={load} onUse={(n) => { setFocus(n); setTab("examples"); }} />}

      {tab === "routes" && <Routes base={base} tables={tables} items={saved} importId={importId} onCopy={doCopy} />}

      {tab === "examples" && <Examples base={base} tables={tables} items={saved} focus={focus} fresh={fresh} onCopy={doCopy} goKeys={() => setTab("api")} />}
    </div>
  );
}

function Routes({ base, tables, items, importId, onCopy }: { base: string; tables: DataTable[]; items: SavedItem[]; importId: string; onCopy: (t: string, w: string) => void }) {
  const routes = routesOf(tables, items), full = (r: { root?: boolean; path: string }) => (r.root ? rootOf(base) : base) + r.path;
  const groups = [...new Set(routes.map((r) => r.group))];
  const [out, setOut] = useState<{ id: string; text: string } | null>(null);
  const tryIt = async (id: string, table: string | null) => {
    try { const r = table ? await dataApi.list(importId, table, { limit: 3 }) : await dataApi.schema(importId); setOut({ id, text: JSON.stringify(r, null, 2).slice(0, 4000) }); }
    catch (e) { setOut({ id, text: errMsg(e) }); }
  };
  const color: Record<string, string> = { GET: "#0f7a47", POST: "#175cd3", PUT: "#b54708", DELETE: "#b42318" };
  return (
    <div>
      <p className="muted">Routes disponibles, générées à partir de vos tables. Adresse de base : <code>{base}</code></p>
      {groups.map((g) => (
        <div key={g} style={{ marginBottom: 14 }}>
          <h4 style={{ margin: "8px 0" }}>{g === "Général" || g === "Requêtes enregistrées" ? g : `Table « ${g} »`}</h4>
          {routes.filter((r) => r.group === g).map((r, i) => {
            const id = `${g}-${i}`, testable = !r.root && r.method === "GET" && (r.path === "" || (r.path.startsWith("/") && r.path.includes("?limit=50")));
            return (
              <div key={id} style={{ borderTop: "1px solid var(--line)", padding: "6px 0" }}>
                <span style={{ ...mono, color: "#fff", background: color[r.method], padding: "1px 6px", borderRadius: 4, marginRight: 8 }}>{r.method}</span>
                <code style={{ wordBreak: "break-all" }}>{r.path || "/"}</code>
                <div className="muted">{r.title}</div>
                {r.body && <code style={{ display: "block", ...mono }}>{r.body}</code>}
                <button onClick={() => onCopy(full(r), "Adresse")}>Copier l'adresse</button>{" "}
                {testable && <button onClick={() => void tryIt(id, r.path === "" ? null : g)}>Essayer</button>}
                {out?.id === id && <pre style={{ ...mono, maxHeight: 240, overflow: "auto", background: "var(--soft, #f4f7f5)", padding: 8 }}>{out.text}</pre>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

type Lang = "pq" | "vba" | "curl" | "js" | "py";
function Examples({ base, tables, items, focus, fresh, onCopy, goKeys }: { base: string; tables: DataTable[]; items: SavedItem[]; focus: string; fresh: NewApiKey | null; onCopy: (t: string, w: string) => void; goKeys: () => void }) {
  const [lang, setLang] = useState<Lang>("vba");
  const [table, setTable] = useState("");
  useEffect(() => { if (focus) setTable(`q:${focus}`); }, [focus]);
  const sel = table || tables[0]?.table || "", it = sel.startsWith("q:") ? items.find((x) => x.name === sel.slice(2)) : undefined, t = it ? it.name : sel;
  const key = fresh?.key ?? KEY_PLACEHOLDER;
  const code = !base || !t ? "" : lang === "vba" ? vbaApp(base, key, tables, items) : it ? savedExample(lang, base, it, key) : lang === "pq" ? powerQuery(base, t, key) : lang === "curl" ? curlExample(base, t, key) : lang === "js" ? jsExample(base, t, key) : pythonExample(base, t, key);
  const help: Record<Lang, string> = {
    vba: "Module VBA généré pour VOS tables, requêtes et actions : une fonction par table et par opération, avec les noms de vos colonnes (ex. Vente_Ajouter numero:=\"T1\", ttc:=1160), plus Requete_… et Action_… pour vos routes personnalisées. Téléchargez-le puis, dans Excel : Alt+F11 → Fichier → Importer un fichier. Enregistrez ensuite en .xlsm. Aucun code à écrire pour commencer : lancez Berkios_ChargerTout.",
    pq: "Excel : Données → Obtenir des données → Autres sources → Requête vide → Éditeur avancé : collez, puis Fermer et charger. Si Excel demande des identifiants, choisissez « Anonyme ».",
    curl: "Pour tester depuis un terminal (PowerShell : utilisez curl.exe).", js: "Pour une page web ou une application Node 18+.", py: "Pour un script Python 3 (aucune bibliothèque à installer).",
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {([["vba", "Excel — module VBA"], ["pq", "Excel — Power Query"], ["js", "JavaScript"], ["py", "Python"], ["curl", "curl"]] as [Lang, string][]).map(([id, l]) => <button key={id} className={lang === id ? "primary" : ""} onClick={() => setLang(id)}>{l}</button>)}
        {lang !== "vba" && <select value={sel} onChange={(e) => setTable(e.target.value)}>{tables.map((x) => <option key={x.table} value={x.table}>Table : {x.table}</option>)}{items.filter((x) => x.valid).map((x) => <option key={`q:${x.name}`} value={`q:${x.name}`}>{x.kind === "query" ? "Requête" : "Action"} : {x.name}</option>)}</select>}
      </div>
      <p className="muted">{help[lang]}</p>
      {key === KEY_PLACEHOLDER && <p className="warn">Aucune clé n'est insérée. <button onClick={goKeys}>Créer une clé</button> puis revenez ici : elle sera ajoutée automatiquement. Sans cela, remplacez {KEY_PLACEHOLDER} par votre clé.</p>}
      <textarea readOnly value={code} rows={lang === "vba" ? 16 : 9} style={{ width: "100%", ...mono }} onFocus={(e) => e.currentTarget.select()} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button disabled={!code} onClick={() => onCopy(code, "Code")}>Copier</button>
        {lang === "vba" && <button className="primary" disabled={!code} onClick={() => download("BerkiosApi.bas", code)}>Télécharger BerkiosApi.bas</button>}
      </div>
      {lang === "vba" && tables.length > 0 && (<><h4 style={{ marginBottom: 4 }}>Exemple d'utilisation dans votre macro</h4><textarea readOnly value={vbaUsage(tables)} rows={14} style={{ width: "100%", ...mono }} onFocus={(e) => e.currentTarget.select()} /></>)}
      <p className="muted">La clé est enregistrée dans le code : ne partagez pas le fichier ou le script qui la contient, et révoquez-la (onglet API & clés) si elle fuit.</p>
    </div>
  );
}
