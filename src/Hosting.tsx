import { useCallback, useEffect, useRef, useState } from "react";
import { hosting, resetHostingSession, SENSITIVE_LABEL, STATE_LABEL, withSensitiveMode, type Cap, type ImportRow, type ImportView, type SensitiveMode } from "./hosting";
import { api } from "./api";
import { DataBrowser } from "./DataBrowser";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erreur inconnue");
const LABELS: Record<string, string> = {
  rowsValid: "Lignes valides", rowsRejected: "Lignes rejetées", rowsTotal: "Lignes lues", rows: "Lignes", tables: "Tableaux",
  imported: "Lignes importées", rejected: "Rejetées", warnings: "Avertissements", durationMs: "Durée (ms)",
};

/** Hébergement des données d'un classeur Excel : téléverser, contrôler (simulation), puis publier dans la base sécurisée de l'entreprise. */
export function Hosting() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [caps, setCaps] = useState<Cap | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [cur, setCur] = useState<ImportView | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const refresh = useCallback(async () => { try { setRows(await hosting.list()); } catch (e) { setError(errMsg(e)); } }, []);

  useEffect(() => {
    api.hostingConfig().then(async (c) => {
      setEnabled(c.enabled);
      if (!c.enabled) return;
      try { setCaps(await hosting.capabilities()); await refresh(); } catch (e) { setError(errMsg(e)); }
    }).catch(() => setEnabled(false));
    return () => { window.clearTimeout(timer.current); resetHostingSession(); };
  }, [refresh]);

  // Suivi de l'importation en cours (interrogation toutes les 2 s tant qu'elle tourne).
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (cur?.state !== "running") return;
    timer.current = window.setTimeout(async () => {
      try { const v = await hosting.get(cur.id); setCur(v); if (v.state !== "running") await refresh(); } catch (e) { setError(errMsg(e)); }
    }, 2000);
    return () => window.clearTimeout(timer.current);
  }, [cur, refresh]);

  const act = async (key: string, fn: () => Promise<ImportView | void>) => {
    setBusy(key); setError("");
    try { const r = await fn(); if (r) setCur(r); await refresh(); } catch (e) { setError(errMsg(e)); } finally { setBusy(""); }
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    setConfirm(false);
    void act("upload", async () => { const up = await hosting.upload(f); return hosting.create(up.workbookId); });
  };

  if (enabled === null) return <section className="panel"><h2>Hébergement</h2><p className="muted">Chargement…</p></section>;
  if (!enabled) return <section className="panel"><h2>Hébergement</h2><p className="muted">L'hébergement n'est pas encore activé. Contactez-nous pour l'ouvrir sur votre compte.</p></section>;

  const importable = caps?.postgres.configured && caps.postgres.reachable;
  return (
    <section className="panel">
      <h2>Hébergement de vos données Excel</h2>
      <p className="muted">Déposez votre classeur : nous détectons vos tableaux, simulons l'import sans rien écrire, puis nous les publions dans une base dédiée à votre entreprise.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {caps && !caps.analyzer && <p className="warn">La lecture des classeurs est momentanément indisponible côté serveur.</p>}
      {caps && !importable && <p className="warn">La publication est momentanément indisponible : vous pouvez analyser et simuler, mais pas importer.</p>}

      <label>Classeur Excel (.xlsx, .xlsm, .xls){caps ? ` — ${Math.round(caps.maxUploadBytes / 1048576)} Mo max` : ""}
        <input type="file" accept=".xlsx,.xlsm,.xls" disabled={busy !== ""} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {busy === "upload" && <p className="muted">Téléversement et analyse…</p>}

      {cur && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>{cur.fileName} <span className="muted">— {STATE_LABEL[cur.state] ?? cur.state}</span></h3>
          {cur.error && <p className="error">{cur.error}</p>}
          <ul>
            {cur.analysis.tables.map((t) => (
              <li key={t.name}><b>{t.name}</b> — {t.dataRowCount} ligne(s), {t.fields.length} colonne(s){t.fields.some((f) => f.sensitive) ? " · contient des champs sensibles (protégés)" : ""}</li>
            ))}
          </ul>
          <SensitiveFields view={cur} disabled={busy !== "" || ["running", "completed"].includes(cur.state)} onChange={(sid, key, mode) => act("sens", () => hosting.update(cur.id, withSensitiveMode(cur.options, sid, key, mode)))} />
          {cur.plan.warnings.slice(0, 5).map((w, i) => <p key={i} className="warn">{w}</p>)}
          {cur.progress && cur.state === "running" && <p className="muted">Importation : {cur.progress.table} ({cur.progress.done}/{cur.progress.total})</p>}
          {cur.dryRun && <Summary title="Simulation (rien n'a été écrit)" s={cur.dryRun.summary} />}
          {cur.report && <Summary title="Rapport d'importation" s={cur.report.summary} />}

          {["prepared", "dry_run", "failed", "interrupted"].includes(cur.state) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button disabled={busy !== ""} onClick={() => act("dry", () => hosting.dryRun(cur.id))}>{busy === "dry" ? "Simulation…" : cur.dryRun ? "Relancer la simulation" : "Simuler l'importation"}</button>
              {cur.dryRun && importable && (
                <>
                  <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> Je confirme la publication de ces données</label>
                  <button className="primary" disabled={busy !== "" || !confirm} onClick={() => act("start", () => hosting.start(cur.id))}>Publier les données</button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {cur?.state === "completed" && <DataBrowser importId={cur.id} />}

      <h3 style={{ marginTop: 24 }}>Mes importations</h3>
      {rows.length === 0 && <p className="muted">Aucune importation pour le moment.</p>}
      <div className="orders">
        {rows.map((r) => (
          <div className="card" key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span><b>{r.fileName}</b> <span className="muted">— {STATE_LABEL[r.state] ?? r.state} · {new Date(r.createdAt).toLocaleString()}</span></span>
            <span style={{ display: "flex", gap: 8 }}>
              <button disabled={busy !== ""} onClick={() => act("open", () => hosting.get(r.id))}>Ouvrir</button>
              {r.state !== "running" && <button disabled={busy !== ""} onClick={() => { if (window.confirm("Supprimer cette importation ? Les données déjà publiées restent dans votre base.")) void act("del", async () => { await hosting.remove(r.id); if (cur?.id === r.id) setCur(null); }); }}>Supprimer</button>}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Summary({ title, s }: { title: string; s: Record<string, number | string | boolean | null> }) {
  const entries = Object.entries(s).filter(([, v]) => typeof v === "number" || typeof v === "string");
  return (
    <div style={{ margin: "12px 0" }}>
      <b>{title}</b>
      <ul>{entries.map(([k, v]) => <li key={k}>{LABELS[k] ?? k} : {String(v)}</li>)}</ul>
    </div>
  );
}

/** Colonnes détectées comme sensibles (mot de passe, jeton, secret…) : par défaut leurs lignes sont rejetées ; on choisit ici le traitement. */
function SensitiveFields({ view, disabled, onChange }: { view: ImportView; disabled: boolean; onChange: (sourceId: string, key: string, mode: SensitiveMode) => void }) {
  const rows = view.plan.tables.flatMap((t, ti) => t.fields.flatMap((f, fi) => {
    if (!f.sensitive) return [];
    const key = view.analysis.tables[ti]?.fields[fi]?.field ?? f.name;
    const mode: SensitiveMode = view.options.mapping[t.sourceId]?.fields?.[key]?.sensitiveMode ?? f.sensitiveMode ?? "reject";
    return [{ t, f, key, mode }];
  }));
  if (rows.length === 0) return null;
  return (
    <div style={{ margin: "12px 0" }}>
      <b>Champs sensibles</b>
      <p className="muted">Ces colonnes contiennent des valeurs confidentielles. Elles ne sont jamais enregistrées en clair : choisissez comment les traiter.</p>
      {rows.map(({ t, f, key, mode }) => (
        <label key={`${t.sourceId}:${key}`} style={{ display: "block", margin: "8px 0" }}>
          🔒 {t.table} · {f.sourceHeader}
          <select value={mode} disabled={disabled} onChange={(e) => onChange(t.sourceId, key, e.target.value as SensitiveMode)}>
            {(Object.keys(SENSITIVE_LABEL) as SensitiveMode[]).map((m) => <option key={m} value={m}>{SENSITIVE_LABEL[m]}</option>)}
          </select>
          {mode === "reject" && <span className="warn"> Les lignes de ce tableau seront rejetées. Choisissez « Protéger » pour les importer sans stocker la valeur en clair.</span>}
        </label>
      ))}
    </div>
  );
}
