import { useCallback, useEffect, useRef, useState } from "react";
import { hosting, resetHostingSession, subApi, type ImportCheck, type Subscription, SENSITIVE_LABEL, STATE_LABEL, withSensitiveMode, type Cap, type ImportRow, type ImportView, type SensitiveMode } from "./hosting";
import { api } from "./api";
import { Dashboard } from "./Dashboard";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erreur inconnue");
const LABELS: Record<string, string> = {
  rowsValid: "Lignes valides", rowsRejected: "Lignes rejetées", rowsTotal: "Lignes lues", rows: "Lignes", tables: "Tableaux",
  imported: "Lignes importées", rejected: "Rejetées", warnings: "Avertissements", durationMs: "Durée (ms)",
};
const stateTone: Record<string, string> = {
  prepared: "ready", dry_run: "review", running: "running", completed: "done", failed: "failed", interrupted: "review",
};

export function Hosting({ onPlans }: { onPlans: () => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [caps, setCaps] = useState<Cap | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [cur, setCur] = useState<ImportView | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [check, setCheck] = useState<ImportCheck | null>(null);
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

  useEffect(() => { subApi.me().then(setSub).catch(() => undefined); }, []);
  // Après une simulation : le fichier tient-il dans l'offre ? (avant toute publication)
  const dryAt = cur?.dryRun ? JSON.stringify(cur.dryRun.summary) : "";
  useEffect(() => {
    setCheck(null);
    if (!cur || !cur.dryRun || ["running", "completed"].includes(cur.state)) return;
    let live = true;
    subApi.check(cur.id).then((c) => { if (live) setCheck(c); }).catch(() => undefined);
    return () => { live = false; };
  }, [cur?.id, cur?.state, dryAt]); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (enabled === null) return <section className="hosting-shell"><div className="hosting-loading"><span className="hosting-spinner" />Chargement de votre espace d'hébergement…</div></section>;
  if (!enabled) return <section className="hosting-shell"><div className="hosting-empty"><div className="hosting-symbol">▤</div><h2>Votre espace d'hébergement</h2><p>L'hébergement n'est pas encore activé sur votre compte. Contactez-nous pour demander son activation.</p></div></section>;

  const importable = !!(caps?.postgres.configured && caps.postgres.reachable);
  const totalTables = cur?.analysis.tables.length ?? 0;
  const totalRows = cur?.analysis.tables.reduce((n, t) => n + t.dataRowCount, 0) ?? 0;
  const completed = rows.filter((r) => r.state === "completed").length;
  return (
    <section className="hosting-shell">
      <header className="hosting-hero">
        <div className="hosting-hero-copy">
          <div className="hosting-kicker"><span className="hosting-live-dot" /> ESPACE CLOUD EXCELPRO</div>
          <h1>Mon <span>hébergement</span></h1>
          <p>Transformez vos classeurs Excel en données accessibles en ligne, prêtes à alimenter vos applications, vos API et vos outils métiers.</p>
          <div className="hosting-hero-tags"><span>Base de données PostgreSQL</span><span>API REST</span><span>Requêtes & actions</span></div>
        </div>
        <div className="hosting-hero-art" aria-hidden="true">
          <div className="hosting-orbit orbit-one" /><div className="hosting-orbit orbit-two" />
          <div className="hosting-stack"><i /><i /><i /><b>DB</b></div>
          <span className="hosting-art-node node-api">API</span><span className="hosting-art-node node-data">DATA</span>
        </div>
      </header>

      <div className="hosting-stats">
        <div className="hosting-stat"><span className="stat-icon">▤</span><div><small>Importations</small><strong>{rows.length}</strong><em>classeurs enregistrés</em></div></div>
        <div className="hosting-stat"><span className="stat-icon">✓</span><div><small>Publications réussies</small><strong>{completed}</strong><em>données disponibles</em></div></div>
        <div className="hosting-stat"><span className="stat-icon">▦</span><div><small>Tables détectées</small><strong>{totalTables}</strong><em>{totalRows.toLocaleString("fr-FR")} lignes dans l'import ouvert</em></div></div>
        <div className="hosting-stat"><span className="stat-icon">⌁</span><div><small>État du service</small><strong className={importable ? "stat-online" : "stat-pending"}>{importable ? "Opérationnel" : "À vérifier"}</strong><em>connexion base de données</em></div></div>
      </div>

      {sub && sub.access.state === "trial" && <div className="hosting-alert plan-trial"><b>i</b><span>Essai gratuit : <b>{sub.access.daysLeft ?? 0} jour(s) restant(s)</b> sur l'offre « {sub.plan} ». <button className="link" onClick={onPlans}>Choisir une offre</button></span></div>}
      {sub && sub.access.state === "expired" && <div className="hosting-alert plan-expired" role="alert"><b>!</b><span>Votre offre a expiré : vos données restent consultables, mais l'importation et les modifications sont suspendues. <button className="link" onClick={onPlans}>Renouveler mon offre</button></span></div>}
      {sub && sub.access.state === "active" && sub.access.daysLeft !== null && sub.access.daysLeft <= 7 && <div className="hosting-alert plan-trial"><b>i</b><span>Votre offre « {sub.plan} » expire dans {sub.access.daysLeft} jour(s). <button className="link" onClick={onPlans}>Renouveler</button></span></div>}
      {sub?.clients && sub.clients.limit !== null && sub.clients.used >= sub.clients.limit * 0.8 && (
        <div className={`hosting-alert ${sub.clients.used >= sub.clients.limit ? "plan-expired" : "plan-trial"}`} role="alert"><b>{sub.clients.used >= sub.clients.limit ? "!" : "i"}</b>
          <span>{sub.clients.used >= sub.clients.limit ? `Palier de clients atteint (${sub.clients.used} / ${sub.clients.limit}) : vos clients actuels continuent, mais un nouveau client ne peut plus s'inscrire.` : `Vous approchez de votre palier de clients (${sub.clients.used} / ${sub.clients.limit}).`} <button className="link" onClick={onPlans}>Passer au palier supérieur</button></span></div>
      )}
      {error && <div className="hosting-alert" role="alert"><b>!</b><span>{error}</span></div>}
      {caps && !caps.analyzer && <div className="hosting-alert"><b>!</b><span>La lecture des classeurs est momentanément indisponible côté serveur.</span></div>}
      {caps && !importable && <div className="hosting-alert"><b>!</b><span>La publication est momentanément indisponible. Vous pouvez analyser et simuler, mais pas encore importer.</span></div>}

      <div className="hosting-section-heading"><div><span className="hosting-section-kicker">COMMENCER</span><h2>Publier un classeur</h2><p>Importez votre fichier, vérifiez les données détectées, puis publiez-les.</p></div><span className="hosting-step-label">3 étapes simples</span></div>
      <div className="hosting-workspace">
        <div className="hosting-upload-card">
          <div className="hosting-upload-icon">↑</div>
          <h3>Importer un fichier Excel</h3>
          <p>Choisissez un classeur pour analyser automatiquement ses feuilles, colonnes et tableaux.</p>
          <label className="hosting-dropzone">
            <input type="file" accept=".xlsx,.xlsm,.xls" disabled={busy !== ""} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            <span className="hosting-file-icon">＋</span>
            <strong>{busy === "upload" ? "Téléversement et analyse…" : "Sélectionner un classeur"}</strong>
            <small>Formats .xlsx, .xlsm, .xls {caps ? `· ${Math.round(caps.maxUploadBytes / 1048576)} Mo maximum` : ""}</small>
          </label>
          <div className="hosting-secure-note"><span>▣</span> Connexion sécurisée · Vos données restent dans votre espace</div>
        </div>
        <div className="hosting-process-card">
          <h3>Comment ça fonctionne ?</h3>
          <div className="hosting-process-step"><span>01</span><div><b>Analyse automatique</b><p>ExcelPro détecte les tableaux, les colonnes et les types de données.</p></div></div>
          <div className="hosting-process-step"><span>02</span><div><b>Simulation et contrôle</b><p>Prévisualisez les résultats et les éventuelles erreurs avant publication.</p></div></div>
          <div className="hosting-process-step"><span>03</span><div><b>Publication dans le cloud</b><p>Vos données deviennent accessibles via les routes API générées.</p></div></div>
          <div className="hosting-capability-row"><span>⌘ API REST</span><span>↗ Power Query</span><span>⌘ Python / VBA</span></div>
        </div>
      </div>

      {cur && (
        <div className="hosting-import-detail">
          <div className="hosting-detail-top">
            <div><span className="hosting-section-kicker">IMPORTATION SÉLECTIONNÉE</span><h2>{cur.fileName}</h2><p>État : <span className={`hosting-state ${stateTone[cur.state] ?? ""}`}>{STATE_LABEL[cur.state] ?? cur.state}</span></p></div>
            <span className="hosting-detail-mark">▤</span>
          </div>
          {cur.error && <p className="error">{cur.error}</p>}
          <div className="hosting-detected-grid">
            {cur.analysis.tables.map((t) => <div className="hosting-table-chip" key={t.name}><span>▦</span><div><b>{t.name}</b><small>{t.dataRowCount.toLocaleString("fr-FR")} lignes · {t.fields.length} colonnes{t.fields.some((f) => f.sensitive) ? " · champs sensibles" : ""}</small></div></div>)}
          </div>
          <SensitiveFields view={cur} disabled={busy !== "" || ["running", "completed"].includes(cur.state)} onChange={(sid, key, mode) => act("sens", () => hosting.update(cur.id, withSensitiveMode(cur.options, sid, key, mode)))} />
          {cur.plan.warnings.slice(0, 5).map((w, i) => <p key={i} className="warn">{w}</p>)}
          {cur.progress && cur.state === "running" && <div className="hosting-progress"><div><b>Publication en cours</b><span>{cur.progress.table} · {cur.progress.done}/{cur.progress.total}</span></div><div className="hosting-progress-track"><i style={{ width: `${cur.progress.total ? Math.min(100, cur.progress.done / cur.progress.total * 100) : 0}%` }} /></div></div>}
          {cur.dryRun && <Summary title="Résultat de la simulation" s={cur.dryRun.summary} />}
          {check && check.message && (
            <div className={`hosting-alert ${check.ok ? "plan-trial" : "plan-expired"}`} role={check.ok ? "status" : "alert"}><b>{check.ok ? "i" : "!"}</b><span>{check.message}{!check.ok && <> <button className="link" onClick={onPlans}>Changer d'offre</button></>}</span></div>
          )}
          {cur.report && <Summary title="Rapport de publication" s={cur.report.summary} />}
          {["prepared", "dry_run", "failed", "interrupted"].includes(cur.state) && (
            <div className="hosting-actions">
              <button disabled={busy !== ""} onClick={() => act("dry", () => hosting.dryRun(cur.id))}>{busy === "dry" ? "Simulation…" : cur.dryRun ? "↻ Relancer la simulation" : "① Simuler l'importation"}</button>
              {cur.dryRun && importable && <><label className="hosting-confirm"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> Je confirme la publication de ces données</label><button className="primary" disabled={busy !== "" || !confirm || (check !== null && !check.ok)} onClick={() => act("start", () => hosting.start(cur.id))}>Publier les données →</button></>}
            </div>
          )}
        </div>
      )}

      {cur?.state === "completed" && <div className="hosting-dashboard-wrap"><div className="hosting-section-heading"><div><span className="hosting-section-kicker">VOS DONNÉES</span><h2>Explorer la base publiée</h2><p>Consultez les tables et les enregistrements disponibles.</p></div></div><Dashboard importId={cur.id} fileName={cur.fileName} /></div>}

      <div className="hosting-section-heading hosting-history-heading"><div><span className="hosting-section-kicker">ESPACE PERSONNEL</span><h2>Mes importations</h2><p>Retrouvez et gérez les classeurs déjà envoyés.</p></div><span className="hosting-count">{rows.length} élément(s)</span></div>
      {rows.length === 0 ? <div className="hosting-empty-list"><span>▤</span><b>Aucune importation pour le moment</b><p>Votre premier classeur apparaîtra ici après son téléversement.</p></div> : (
        <div className="hosting-history">
          {rows.map((r) => (
            <div className="hosting-history-row" key={r.id}>
              <div className="hosting-history-file"><span className="hosting-xls-icon">X</span><div><b>{r.fileName}</b><small>Ajouté le {new Date(r.createdAt).toLocaleString("fr-FR")}</small></div></div>
              <span className={`hosting-state ${stateTone[r.state] ?? ""}`}>{STATE_LABEL[r.state] ?? r.state}</span>
              <div className="hosting-history-actions"><button disabled={busy !== ""} onClick={() => act("open", () => hosting.get(r.id))}>Ouvrir</button>{r.state !== "running" && <button className="hosting-delete" disabled={busy !== ""} onClick={() => { if (window.confirm("Supprimer cette importation ? Les données déjà publiées restent dans votre base.")) void act("del", async () => { await hosting.remove(r.id); if (cur?.id === r.id) setCur(null); }); }}>Supprimer</button>}</div>
            </div>
          ))}
        </div>
      )}
      <div className="hosting-footnote"><span>ⓘ</span> La suppression d'une importation ne supprime pas les données déjà publiées dans votre base.</div>
    </section>
  );
}

function Summary({ title, s }: { title: string; s: Record<string, number | string | boolean | null> }) {
  const entries = Object.entries(s).filter(([, v]) => typeof v === "number" || typeof v === "string");
  return <div className="hosting-summary"><b>{title}</b><div className="hosting-summary-grid">{entries.map(([k, v]) => <div key={k}><small>{LABELS[k] ?? k}</small><strong>{String(v)}</strong></div>)}</div></div>;
}

function SensitiveFields({ view, disabled, onChange }: { view: ImportView; disabled: boolean; onChange: (sourceId: string, key: string, mode: SensitiveMode) => void }) {
  const rows = view.plan.tables.flatMap((t, ti) => t.fields.flatMap((f, fi) => {
    if (!f.sensitive) return [];
    const key = view.analysis.tables[ti]?.fields[fi]?.field ?? f.name;
    const mode: SensitiveMode = view.options.mapping[t.sourceId]?.fields?.[key]?.sensitiveMode ?? f.sensitiveMode ?? "reject";
    return [{ t, f, key, mode }];
  }));
  if (rows.length === 0) return null;
  return <div className="hosting-sensitive"><b>🔒 Champs sensibles détectés</b><p>Ces colonnes contiennent des informations confidentielles. Choisissez leur mode de traitement avant la publication.</p>{rows.map(({ t, f, key, mode }) => <label key={`${t.sourceId}:${key}`}><span>{t.table} · {f.sourceHeader}</span><select value={mode} disabled={disabled} onChange={(e) => onChange(t.sourceId, key, e.target.value as SensitiveMode)}>{(Object.keys(SENSITIVE_LABEL) as SensitiveMode[]).map((m) => <option key={m} value={m}>{SENSITIVE_LABEL[m]}</option>)}</select>{mode === "reject" && <small className="warn">Les lignes concernées seront rejetées. Choisissez « Protéger » pour ne pas conserver la valeur en clair.</small>}</label>)}</div>;
}
