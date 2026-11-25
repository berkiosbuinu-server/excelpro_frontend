import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { archiveOf, pick, type Picked } from "./zip";
import { GIT_STATUS_LABEL, hookUrl, isSshRepo, repoUrlError } from "./sitesui";
import { BILLING_SITE_LABEL, SITES_DOMAIN, SITE_ID_RE, TLS_LABEL, accessNotice, fmtBytes, fmtUsdCents, sitesApi, slugify, type SiteAccess, type SiteGit, type SiteOffer, type SitePlan, type SiteRow, type SiteView } from "./sites";
import { CopyButton, Icon, useEscape, useScrollLock, useToast } from "./ui";
import { errMsg } from "./labels";

/* ---------- Aides d'affichage ---------- */
type Tab = "overview" | "deploys" | "domains" | "env" | "settings";
const TABS: { id: Tab; label: string; icon: "home" | "rotate" | "link" | "database" | "sliders" }[] = [
  { id: "overview", label: "Aperçu", icon: "home" }, { id: "deploys", label: "Déploiements", icon: "rotate" },
  { id: "domains", label: "Domaines", icon: "link" }, { id: "env", label: "Variables", icon: "database" }, { id: "settings", label: "Réglages", icon: "sliders" },
];
type Live = "live" | "draft" | "off";
const liveOf = (version: number | null, access: SiteAccess): Live => (access.state === "expired" || access.state === "none" ? "off" : version ? "live" : "draft");
const LIVE_LABEL: Record<Live, string> = { live: "En ligne", draft: "Pas encore publié", off: "Hors ligne" };

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!(s >= 60)) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `il y a ${Math.floor(s / 86400)} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
};
const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

function SiteAvatar({ id, name, size = 44 }: { id: string; name: string; size?: number }) {
  return <span className="site-av" style={{ ["--h" as string]: hue(id), width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">{(name.trim() || id).charAt(0).toUpperCase()}</span>;
}
function StatusPill({ live }: { live: Live }) { return <span className={`live live-${live}`}><i />{LIVE_LABEL[live]}</span>; }
function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <div className={`meter${pct >= 90 ? " hot" : ""}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>;
}

/** Fichiers déposés par glisser-déposer : un dossier est parcouru en entier (les chemins relatifs sont conservés). */
async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  // Les entrées doivent être lues tout de suite : elles disparaissent après le premier `await`.
  const entries = Array.from(dt.items ?? []).map((i) => (i as unknown as { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry?.()).filter(Boolean) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!entries.length) return Array.from(dt.files);
  const out: File[] = [];
  const walk = async (e: any, base: string): Promise<void> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (e.isFile) {
      const f: File = await new Promise((res, rej) => e.file(res, rej));
      Object.defineProperty(f, "webkitRelativePath", { value: base + f.name });
      out.push(f);
    } else if (e.isDirectory) {
      const reader = e.createReader(); const all: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
      for (;;) { const batch: any[] = await new Promise((res, rej) => reader.readEntries(res, rej)); if (!batch.length) break; all.push(...batch); } // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const c of all) await walk(c, `${base}${e.name}/`);
    }
  };
  for (const e of entries) await walk(e, "");
  return out;
}

/** Page « Mes sites » : abonnement, liste des sites, puis pour chaque site aperçu, déploiements, domaines, variables et réglages. */
export function Sites({ transferNumber }: { transferNumber: string }) {
  const [plan, setPlan] = useState<SitePlan | null>(null);
  const [rows, setRows] = useState<SiteRow[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [site, setSite] = useState<SiteView | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [paying, setPaying] = useState<SiteOffer | null>(null);
  const [creating, setCreating] = useState(false);
  const { show, node: toast } = useToast();

  const refresh = useCallback(async () => {
    try { const p = await sitesApi.plan(); setPlan(p); setRows(p.plan ? await sitesApi.list() : []); setError(""); } catch (e) { setError(errMsg(e)); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!sel) { setSite(null); return; } sitesApi.get(sel).then(setSite).catch((e) => setError(errMsg(e))); }, [sel]);

  const act = async <T,>(label: string, fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
    setBusy(label); setError("");
    try { const r = await fn(); if (ok) show(ok); return r; } catch (e) { setError(errMsg(e)); } finally { setBusy(""); }
  };
  const update = (s: SiteView) => { setSite(s); void refresh(); };
  const canWrite = plan?.access.state === "active";
  const notice = plan ? accessNotice(plan.access) : null;
  const openSite = (id: string, t: Tab = "overview") => { setSel(id); setTab(t); window.scrollTo({ top: 0 }); };
  const toOffers = () => { setSel(null); window.setTimeout(() => document.getElementById("sites-offers")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); };

  if (!plan && !error) return <section className="page"><div className="skeleton page-sk" aria-busy="true" aria-label="Chargement de vos sites" /></section>;

  const alerts = (
    <>
      {error && <p className="alert err" role="alert"><Icon name="alert" size={18} /><span>{error}</span><button type="button" className="icon-btn sm" aria-label="Fermer" onClick={() => setError("")}><Icon name="x" size={16} /></button></p>}
      {notice && <p className={`alert ${notice.level === "info" ? "info" : "err"}`} role="status"><Icon name={notice.level === "info" ? "info" : "alert"} size={18} /><span>{notice.text} <button type="button" className="link" onClick={toOffers}>Voir les offres</button></span></p>}
      {plan?.pending && <p className="alert info"><Icon name="clock" size={18} /><span>Paiement en cours de vérification : offre {plan.pending.plan === "site-pro" ? "Pro" : "Starter"}, {fmtUsdCents(plan.pending.amountCents)} (référence {plan.pending.reference}). Activation en général sous 24 h.</span></p>}
    </>
  );

  const payModal = paying && <PayModal offer={paying} transfer={transferNumber} current={plan?.plan ?? null} onClose={() => setPaying(null)} onSent={() => { setPaying(null); void refresh(); }} />;

  /* --- Impossible de charger l'abonnement --- */
  if (!plan) {
    return <section className="page sites">{alerts}<button type="button" onClick={() => void refresh()}><Icon name="rotate" size={17} />Réessayer</button></section>;
  }

  /* --- Pas encore d'offre : présentation + choix de l'offre --- */
  if (!plan.plan) {
    return (
      <section className="page sites">
        <div className="onboard">
          <h1>Publiez votre site en quelques minutes</h1>
          <p className="lead">Mettez en ligne le site créé avec BERKIOS Graphic, ou n'importe quel site statique, à une adresse à vous.</p>
          <ol className="onboard-steps">
            <li><span>1</span><div><b>Choisissez une offre</b><p className="muted">Payez par mobile money, activation sous 24 h.</p></div></li>
            <li><span>2</span><div><b>Créez votre site</b><p className="muted">Donnez-lui un nom et une adresse.</p></div></li>
            <li><span>3</span><div><b>Déposez vos fichiers</b><p className="muted">Un dossier ou une archive .zip suffit.</p></div></li>
          </ol>
        </div>
        {alerts}
        <Offers plan={plan} onPay={setPaying} />
        {payModal}{toast}
      </section>
    );
  }

  /* --- Détail d'un site --- */
  if (sel) {
    return (
      <section className="page sites">
        {site ? (
          <SiteDetail
            site={site} plan={plan} canWrite={canWrite} busy={busy} tab={tab} onTab={setTab} alerts={alerts} toast={toast}
            onBack={() => { setSel(null); void refresh(); }} onOffers={toOffers}
            onDeploy={async (blob, note) => { const s = await act("deploy", () => sitesApi.deploy(site.id, blob, note)); if (s) { update(s); show(`Version ${s.deployed?.version} en ligne (${s.deployed?.files} fichiers, ${fmtBytes(s.deployed?.bytes ?? 0)}${s.deployed?.ignored ? `, ${s.deployed.ignored} fichier(s) caché(s) ignoré(s)` : ""}).`); setTab("overview"); } }}
            onRollback={async (n) => { const s = await act("rb", () => sitesApi.rollback(site.id, n), `Version ${n} remise en ligne.`); if (s) update(s); }}
            onEnv={async (env) => { const s = await act("env", () => sitesApi.setEnv(site.id, env), "Variables enregistrées et appliquées au site."); if (s) update(s); }}
            onAddDomain={async (d) => { const s = await act("dom", () => sitesApi.addDomain(site.id, d)); if (s) update(s); }}
            onVerifyDomain={async (d) => { const r = await act("dom", () => sitesApi.verifyDomain(site.id, d)); if (r) { update(r.site); if (r.verified) show(`${d} est vérifié.`); else show("Pas encore détecté : l'enregistrement DNS peut mettre du temps à se propager. Réessayez dans quelques minutes.", "err"); } }}
            onRemoveDomain={async (d) => { const s = await act("dom", () => sitesApi.removeDomain(site.id, d)); if (s) update(s); }}
            onGitSave={async (b) => { const s = await act("git", () => sitesApi.setGit(site.id, b), "Dépôt enregistré."); if (s) update(s); }}
            onGitDeploy={async () => { const s = await act("gitdeploy", () => sitesApi.deployGit(site.id)); if (s) update(s); }}
            onGitRegen={async (b) => { const s = await act("gitregen", () => sitesApi.regenGit(site.id, b), b.key ? "Nouvelle clé générée : remplacez-la dans les réglages de votre dépôt." : "Nouveau secret généré : mettez à jour le webhook."); if (s) update(s); }}
            onGitRemove={async () => { const s = await act("gitrm", () => sitesApi.removeGit(site.id), "Dépôt déconnecté : le site reste en ligne."); if (s) update(s); }}
            onPoll={update}
            onSettings={async (b) => { const s = await act("set", () => sitesApi.settings(site.id, b), "Réglages enregistrés."); if (s) update(s); }}
            onRemove={async () => { const r = await act("rm", () => sitesApi.remove(site.id)); if (r) { setSel(null); setSite(null); void refresh(); show("Site supprimé."); } }}
          />
        ) : (
          <>
            <div className="page-head"><button type="button" className="back" onClick={() => setSel(null)}><Icon name="left" size={18} />Mes sites</button></div>
            {alerts}
            {!error && <div className="skeleton page-sk" aria-busy="true" />}
          </>
        )}
      </section>
    );
  }

  /* --- Tableau de bord : liste des sites + offre + stockage --- */
  return (
    <SitesHome
      plan={plan} rows={rows} canWrite={canWrite} alerts={alerts} toast={toast} busy={busy === "create"}
      onOpen={openSite} onCreate={() => setCreating(true)} onOffers={toOffers}
      offers={<Offers plan={plan} onPay={setPaying} />}
      creator={creating && (
        <CreateModal limitReached={rows.length >= (plan.limits?.sites ?? 0)} busy={busy === "create"} onClose={() => setCreating(false)}
          onCreate={async (id, name) => { const s = await act("create", () => sitesApi.create(id, name), "Site créé : déposez maintenant vos fichiers."); if (s) { setCreating(false); setSite(s); openSite(s.id, "deploys"); void refresh(); } }} />
      )}
      payModal={payModal}
    />
  );
}

/* ========================= Tableau de bord ========================= */
function SitesHome({ plan, rows, canWrite, alerts, toast, busy, onOpen, onCreate, onOffers, offers, creator, payModal }: {
  plan: SitePlan; rows: SiteRow[]; canWrite: boolean; alerts: React.ReactNode; toast: React.ReactNode; busy: boolean;
  onOpen: (id: string, t?: Tab) => void; onCreate: () => void; onOffers: () => void; offers: React.ReactNode; creator: React.ReactNode; payModal: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const limits = plan.limits;
  const full = rows.length >= (limits?.sites ?? 0);
  const capacity = (limits?.storageMb ?? 0) * (limits?.sites ?? 0) * 1048576;
  const list = useMemo(() => { const k = q.trim().toLowerCase(); return k ? rows.filter((r) => r.name.toLowerCase().includes(k) || r.id.includes(k)) : rows; }, [rows, q]);
  const state = plan.access.state;

  return (
    <section className="page sites">
      <div className="page-head">
        <div className="page-title"><h1>Mes sites</h1><p className="muted">Publiez et gérez vos sites web.</p></div>
        <div className="page-actions">
          <button type="button" className="primary" disabled={!canWrite || full || busy} onClick={onCreate} title={full ? "Limite de sites atteinte pour votre offre" : undefined}><Icon name="plus" size={18} />Nouveau site</button>
        </div>
      </div>
      {alerts}

      <div className="kpis">
        <div className="kpi">
          <p className="kpi-t">Offre</p>
          <p className="kpi-v">{plan.label}<span className={`live live-${state === "active" ? "live" : state === "grace" ? "draft" : "off"}`}><i />{state === "active" ? "Active" : state === "grace" ? "Période de grâce" : "Expirée"}</span></p>
          <p className="muted">{plan.access.expiresAt ? `Jusqu'au ${new Date(plan.access.expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` : "Sans échéance"}</p>
          <button type="button" className="link" onClick={onOffers}>Changer d'offre ou renouveler</button>
        </div>
        <div className="kpi">
          <p className="kpi-t">Sites</p>
          <p className="kpi-v">{plan.usage.sites}<small> / {limits?.sites ?? 0}</small></p>
          <Meter value={plan.usage.sites} max={limits?.sites ?? 0} label="Sites utilisés" />
          <p className="muted">{full ? "Limite atteinte pour votre offre" : `${(limits?.sites ?? 0) - plan.usage.sites} restant(s)`}</p>
        </div>
        <div className="kpi">
          <p className="kpi-t">Stockage</p>
          <p className="kpi-v">{fmtBytes(plan.usage.storageBytes)}<small> / {fmtBytes(capacity)}</small></p>
          <Meter value={plan.usage.storageBytes} max={capacity} label="Stockage utilisé" />
          <p className="muted">{limits ? `${limits.storageMb >= 1024 ? `${limits.storageMb / 1024} Go` : `${limits.storageMb} Mo`} par site · ${limits.versions} versions conservées` : ""}</p>
        </div>
      </div>

      <div className="toolbar">
        <label className="search"><Icon name="search" size={18} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un site…" aria-label="Rechercher un site" /></label>
        <div className="seg" role="group" aria-label="Affichage">
          <button type="button" className={view === "grid" ? "on" : ""} aria-pressed={view === "grid"} onClick={() => setView("grid")} aria-label="Cartes"><Icon name="grid" size={16} /></button>
          <button type="button" className={view === "list" ? "on" : ""} aria-pressed={view === "list"} onClick={() => setView("list")} aria-label="Liste"><Icon name="list" size={16} /></button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <span className="empty-ico"><Icon name="globe" size={28} /></span>
          <h2>Créez votre premier site</h2>
          <p className="muted">Donnez un nom à votre site, puis déposez le dossier ou l'archive .zip généré par BERKIOS Graphic (Déploiements, Web, « Site web (HTML) »).</p>
          <button type="button" className="primary" disabled={!canWrite} onClick={onCreate}><Icon name="plus" size={18} />Nouveau site</button>
        </div>
      ) : list.length === 0 ? (
        <p className="muted center pad">Aucun site ne correspond à « {q} ».</p>
      ) : view === "grid" ? (
        <ul className="site-grid">
          {list.map((r) => {
            const live = liveOf(r.currentVersion, plan.access);
            return (
              <li key={r.id} className="site-card">
                <button type="button" className="site-card-main" onClick={() => onOpen(r.id)}>
                  <div className="site-card-top"><SiteAvatar id={r.id} name={r.name} /><StatusPill live={live} /></div>
                  <h3>{r.name}</h3>
                  <p className="site-url">{r.id}.{SITES_DOMAIN}</p>
                  <p className="site-meta"><span>{r.currentVersion ? `Version ${r.currentVersion}` : "Aucune version"}</span><span>{fmtBytes(r.storageBytes)}</span>{r.domains.length > 0 && <span>{r.domains.length} domaine(s)</span>}</p>
                  <p className="muted">Mis à jour {ago(r.updatedAt)}</p>
                </button>
                <div className="site-card-actions">
                  <a className="btn" href={r.url} target="_blank" rel="noreferrer"><Icon name="external" size={16} />Visiter</a>
                  <button type="button" onClick={() => onOpen(r.id)}>Gérer</button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="site-table" role="table" aria-label="Vos sites">
          <div className="st-row st-head" role="row"><span role="columnheader">Site</span><span role="columnheader">État</span><span role="columnheader" className="hide-sm">Version</span><span role="columnheader" className="hide-sm">Stockage</span><span role="columnheader" className="hide-sm">Mis à jour</span><span role="columnheader" /></div>
          {list.map((r) => (
            <div className="st-row" role="row" key={r.id}>
              <button type="button" className="st-name" role="cell" onClick={() => onOpen(r.id)}><SiteAvatar id={r.id} name={r.name} size={34} /><span><b>{r.name}</b><small>{r.id}.{SITES_DOMAIN}</small></span></button>
              <span role="cell"><StatusPill live={liveOf(r.currentVersion, plan.access)} /></span>
              <span role="cell" className="hide-sm">{r.currentVersion ? `v${r.currentVersion}` : "—"}</span>
              <span role="cell" className="hide-sm">{fmtBytes(r.storageBytes)}</span>
              <span role="cell" className="hide-sm muted">{ago(r.updatedAt)}</span>
              <span role="cell" className="st-act"><a className="icon-btn sm" href={r.url} target="_blank" rel="noreferrer" aria-label={`Visiter ${r.name}`}><Icon name="external" size={16} /></a><button type="button" className="sm" onClick={() => onOpen(r.id)}>Gérer</button></span>
            </div>
          ))}
        </div>
      )}

      {offers}
      {creator}{payModal}{toast}
    </section>
  );
}

/* ========================= Offres ========================= */
function Offers({ plan, onPay }: { plan: SitePlan | null; onPay: (o: SiteOffer) => void }) {
  const current = plan?.plan ?? null;
  return (
    <div id="sites-offers" className="sites-offers">
      <div className="sec-head left"><h2>{current ? "Changer d'offre ou renouveler" : "Choisissez une offre pour publier votre site"}</h2><p className="muted">Paiement par mobile money. Votre offre est activée dès que nous avons vérifié le paiement.</p></div>
      <div className="offer-grid">
        {(plan?.offers ?? []).map((o) => {
          const pro = o.id === "site-pro";
          return (
            <div key={o.id} className={`offer${pro ? " pro" : ""}${o.id === current ? " current" : ""}`}>
              {pro && <span className="ribbon">Recommandée</span>}
              <h3>{o.label}</h3>
              <p className="offer-price">{o.monthlyUsd} $ <small>/ mois</small></p>
              <ul className="ticks">
                <li>{o.sites} site{o.sites > 1 ? "s" : ""} · {o.storageMb >= 1024 ? `${o.storageMb / 1024} Go` : `${o.storageMb} Mo`} par site</li>
                <li>{o.versions} versions et retour arrière</li>
                <li>{o.domains ? `Domaines personnalisés (${o.domains} par site)` : `Adresse .${SITES_DOMAIN}`}</li>
                <li>{o.env ? "Variables d'environnement" : "Sans variables d'environnement"}</li>
              </ul>
              <button type="button" className={pro ? "primary" : ""} onClick={() => onPay(o)}>{o.id === current ? `Renouveler ${o.label}` : `Choisir ${o.label}`}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ========================= Création d'un site ========================= */
function CreateModal({ onCreate, onClose, busy, limitReached }: { onCreate: (id: string, name: string) => void | Promise<void>; onClose: () => void; busy: boolean; limitReached: boolean }) {
  const [name, setName] = useState(""); const [id, setId] = useState(""); const [touched, setTouched] = useState(false);
  useEscape(onClose); useScrollLock();
  const valid = SITE_ID_RE.test(id) && !id.endsWith("-") && !id.includes("--");
  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-site">
        <button type="button" className="close" onClick={onClose} aria-label="Fermer"><Icon name="x" size={18} /></button>
        <h2 id="new-site">Nouveau site</h2>
        {limitReached ? <p className="alert err">Limite de sites atteinte pour votre offre. Passez à une offre supérieure pour en créer d'autres.</p> : (
          <form onSubmit={(e) => { e.preventDefault(); if (valid) void onCreate(id, name.trim() || id); }}>
            <label>Nom du site<input value={name} autoFocus onChange={(e) => { setName(e.target.value); if (!touched) setId(slugify(e.target.value)); }} placeholder="Ma pharmacie" /></label>
            <label>Adresse
              <span className="addr"><input value={id} onChange={(e) => { setTouched(true); setId(e.target.value.toLowerCase()); }} aria-label="Identifiant du site" placeholder="ma-pharmacie" /><em>.{SITES_DOMAIN}</em></span>
            </label>
            {id && !valid ? <p className="field-err">3 à 40 caractères : minuscules, chiffres et tirets, en commençant par une lettre.</p>
              : <p className="muted">Votre site sera disponible à <b>https://{id || "mon-site"}.{SITES_DOMAIN}</b></p>}
            <button className="primary full big" disabled={!valid || busy}>{busy ? "Création…" : "Créer le site"}</button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ========================= Détail d'un site ========================= */
type DetailProps = {
  site: SiteView; plan: SitePlan; canWrite: boolean; busy: string; tab: Tab; onTab: (t: Tab) => void; alerts: React.ReactNode; toast: React.ReactNode;
  onBack: () => void; onOffers: () => void;
  onDeploy: (blob: Blob, note: string) => void | Promise<void>; onRollback: (n: number) => void | Promise<void>; onEnv: (env: Record<string, string>) => void | Promise<void>;
  onAddDomain: (d: string) => void | Promise<void>; onVerifyDomain: (d: string) => void | Promise<void>; onRemoveDomain: (d: string) => void | Promise<void>;
  onSettings: (b: { name?: string; spa?: boolean }) => void | Promise<void>; onRemove: () => void | Promise<void>;
  onGitSave: (b: { url: string; branch: string; dir: string; auto: boolean }) => void | Promise<void>; onGitDeploy: () => void | Promise<void>;
  onGitRegen: (b: { key?: boolean; secret?: boolean }) => void | Promise<void>; onGitRemove: () => void | Promise<void>; onPoll: (s: SiteView) => void;
};

function SiteDetail(p: DetailProps) {
  const { site, plan, canWrite, tab } = p;
  const live = liveOf(site.currentVersion, plan.access);
  return (
    <>
      <div className="page-head site-head">
        <button type="button" className="back" onClick={p.onBack}><Icon name="left" size={18} /><span>Mes sites</span></button>
        <div className="site-id">
          <SiteAvatar id={site.id} name={site.name} size={40} />
          <div><h1>{site.name}</h1><a className="site-url" href={site.url} target="_blank" rel="noreferrer">{site.url.replace(/^https?:\/\//, "")}</a></div>
          <StatusPill live={live} />
        </div>
        <div className="page-actions hide-sm">
          <CopyButton value={site.url} label="Copier le lien" />
          <a className="btn primary" href={site.url} target="_blank" rel="noreferrer"><Icon name="external" size={18} />Visiter</a>
        </div>
        <div className="tabs-u" role="tablist" aria-label="Sections du site">
          {TABS.map((t) => <button type="button" key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => p.onTab(t.id)}><Icon name={t.icon} size={17} /><span>{t.label}</span></button>)}
        </div>
      </div>
      {p.alerts}
      <div className="tab-body">
        {tab === "overview" && <Overview {...p} live={live} />}
        {tab === "deploys" && (
          <div className="two-col">
            <div className="block-card"><h2>Publier</h2><Publish site={site} disabled={!canWrite} busy={p.busy === "deploy"} onDeploy={p.onDeploy} /></div>
            <div className="block-card"><h2>Historique des versions</h2><Versions site={site} disabled={!canWrite} onRollback={p.onRollback} /></div>
          </div>
        )}
        {tab === "deploys" && (
          <div className="block-card"><h2>Déploiement depuis Git</h2><GitPanel site={site} disabled={!canWrite} busy={p.busy} onSave={p.onGitSave} onDeploy={p.onGitDeploy} onRegen={p.onGitRegen} onRemove={p.onGitRemove} onPoll={p.onPoll} /></div>
        )}
        {tab === "domains" && <div className="block-card"><h2>Domaines</h2><Domains site={site} max={plan.limits?.domains ?? 0} disabled={!canWrite} busy={p.busy === "dom"} onOffers={p.onOffers} onAdd={p.onAddDomain} onVerify={p.onVerifyDomain} onRemove={p.onRemoveDomain} /></div>}
        {tab === "env" && <div className="block-card"><h2>Variables d'environnement</h2><EnvEditor site={site} allowed={!!plan.limits?.env} disabled={!canWrite} onOffers={p.onOffers} onSave={p.onEnv} /></div>}
        {tab === "settings" && <Settings site={site} disabled={!canWrite} onSave={p.onSettings} onRemove={p.onRemove} />}
      </div>
      {p.toast}
    </>
  );
}

function Overview({ site, plan, live, onTab, canWrite }: DetailProps & { live: Live }) {
  const perSite = (plan.limits?.storageMb ?? 0) * 1048576;
  const maxDomains = plan.limits?.domains ?? 0;
  const published = site.currentVersion !== null;
  const todo: { done: boolean; title: string; text: string; action?: { label: string; tab: Tab } }[] = [
    { done: true, title: "Site créé", text: `Adresse réservée : ${site.id}.${SITES_DOMAIN}` },
    { done: published, title: "Premier déploiement", text: published ? `Version ${site.currentVersion} en ligne.` : "Déposez votre dossier ou votre archive .zip.", action: published ? undefined : { label: "Publier", tab: "deploys" } },
    { done: !!site.git, title: "Déploiement depuis Git", text: site.git ? `${site.git.url.replace(/^https:\/\//, "")} · branche ${site.git.branch}${site.git.auto ? " · automatique" : ""}` : "Reliez GitHub, GitLab ou Bitbucket : un push met le site à jour.", action: { label: site.git ? "Ouvrir" : "Connecter", tab: "deploys" } },
    { done: site.domains.some((d) => d.status === "verified"), title: "Domaine personnalisé", text: maxDomains ? "Utilisez votre propre nom de domaine." : "Disponible avec l'offre Pro.", action: maxDomains ? { label: "Ajouter", tab: "domains" } : undefined },
  ];
  return (
    <div className="two-col">
      <div className="block-card">
        <h2>État du site</h2>
        <dl className="facts">
          <div><dt>État</dt><dd><StatusPill live={live} /></dd></div>
          <div><dt>Adresse</dt><dd><a href={site.url} target="_blank" rel="noreferrer">{site.url.replace(/^https?:\/\//, "")}</a></dd></div>
          <div><dt>Version en ligne</dt><dd>{site.currentVersion ? `v${site.currentVersion}` : "Aucune"}</dd></div>
          <div><dt>Mis à jour</dt><dd>{ago(site.updatedAt)}</dd></div>
          <div><dt>Créé le</dt><dd>{new Date(site.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</dd></div>
          <div><dt>Stockage</dt><dd><span>{fmtBytes(site.storageBytes)}{perSite ? ` sur ${fmtBytes(perSite)}` : ""}</span><Meter value={site.storageBytes} max={perSite} label="Stockage du site" /></dd></div>
        </dl>
        {live === "off" && <p className="alert err"><Icon name="alert" size={18} />Votre offre a expiré : le site est hors ligne. Renouvelez-la pour le remettre en ligne.</p>}
        <div className="row-actions">
          <button type="button" className="primary" disabled={!canWrite} onClick={() => onTab("deploys")}><Icon name="upload" size={18} />{published ? "Publier une nouvelle version" : "Mettre en ligne"}</button>
          <a className="btn" href={site.url} target="_blank" rel="noreferrer"><Icon name="external" size={18} />Visiter</a>
        </div>
      </div>
      <div className="block-card">
        <h2>Mise en route</h2>
        <ul className="todo">
          {todo.map((t) => (
            <li key={t.title} className={t.done ? "done" : ""}>
              <span className="todo-dot">{t.done ? <Icon name="check" size={14} /> : null}</span>
              <div><b>{t.title}</b><p className="muted">{t.text}</p></div>
              {t.action && <button type="button" className="sm" onClick={() => onTab(t.action!.tab)}>{t.action.label}</button>}
            </li>
          ))}
        </ul>
        {site.versions.length > 0 && (
          <>
            <h3 className="sub">Derniers déploiements</h3>
            <ul className="mini-list">
              {site.versions.slice(0, 3).map((v) => <li key={v.n}><b>v{v.n}</b>{v.current && <span className="tag-ok">en ligne</span>}<span className="muted">{ago(v.createdAt)}</span></li>)}
            </ul>
            <button type="button" className="link" onClick={() => onTab("deploys")}>Voir tout l'historique</button>
          </>
        )}
      </div>
    </div>
  );
}

function Publish({ site, disabled, busy, onDeploy }: { site: SiteView; disabled: boolean; busy: boolean; onDeploy: (blob: Blob, note: string) => void | Promise<void> }) {
  const [picked, setPicked] = useState<Picked>(pick(null)); const [note, setNote] = useState(""); const [err, setErr] = useState(""); const [drag, setDrag] = useState(false);
  const dirRef = useRef<HTMLInputElement>(null); const zipRef = useRef<HTMLInputElement>(null);
  useEffect(() => { dirRef.current?.setAttribute("webkitdirectory", ""); dirRef.current?.setAttribute("directory", ""); }, []);
  const size = picked.kind === "zip" ? picked.file.size : picked.kind === "files" ? picked.files.reduce((n, f) => n + f.file.size, 0) : 0;
  const label = picked.kind === "zip" ? picked.file.name : picked.kind === "files" ? `${picked.files.length} fichier(s)` : "";
  const go = async () => { setErr(""); try { await onDeploy(await archiveOf(picked), note.trim()); setPicked(pick(null)); setNote(""); } catch (e) { setErr(errMsg(e)); } };
  return (
    <div className="publish">
      <div className={`drop${drag ? " over" : ""}${picked.kind !== "empty" ? " has" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={async (e) => { e.preventDefault(); setDrag(false); setErr(""); try { setPicked(pick(await filesFromDrop(e.dataTransfer))); } catch (x) { setErr(errMsg(x)); } }}>
        {picked.kind === "empty" ? (
          <div className="drop-btn static">
            <span className="drop-ico"><Icon name="upload" size={24} /></span>
            <b>Glissez ici votre dossier ou votre .zip</b>
            <small>ou choisissez-le ci-dessous. La page d'accueil doit s'appeler <code>index.html</code>.</small>
            <div className="pickers">
              <button type="button" onClick={() => dirRef.current?.click()}><Icon name="folder" size={17} />Choisir un dossier</button>
              <button type="button" onClick={() => zipRef.current?.click()}><Icon name="file" size={17} />Choisir un .zip</button>
            </div>
          </div>
        ) : (
          <div className="drop-file"><span className="drop-ico ok"><Icon name={picked.kind === "zip" ? "file" : "folder"} size={22} /></span><div><b>{label}</b><small>{fmtBytes(size)}</small></div><button type="button" onClick={() => setPicked(pick(null))}>Retirer</button></div>
        )}
        <input ref={dirRef} type="file" multiple hidden onChange={(e) => { setPicked(pick(e.target.files)); e.target.value = ""; }} />
        <input ref={zipRef} type="file" accept=".zip,application/zip" hidden onChange={(e) => { setPicked(pick(e.target.files)); e.target.value = ""; }} />
      </div>
      <p className="muted">Utilisez le dossier généré par BERKIOS Graphic (Déploiements, Web, « Site web (HTML) »). Les fichiers cachés (comme <code>.env</code> ou <code>.git</code>) ne sont jamais publiés.</p>
      <label>Note de version <span className="muted">(facultatif)</span><input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="ex. nouvelle page Contact" /></label>
      <button type="button" className="primary big full" disabled={disabled || busy || picked.kind === "empty"} onClick={() => void go()}>{busy ? "Publication en cours…" : site.currentVersion ? "Publier une nouvelle version" : "Mettre en ligne"}</button>
      {disabled && <p className="muted">Votre offre n'est pas active : la publication est suspendue.</p>}
      {err && <p className="alert err" role="alert"><Icon name="alert" size={18} />{err}</p>}
    </div>
  );
}

function Versions({ site, disabled, onRollback }: { site: SiteView; disabled: boolean; onRollback: (n: number) => void | Promise<void> }) {
  if (!site.versions.length) return <p className="muted">Aucune version publiée pour l'instant.</p>;
  return (
    <ol className="timeline">
      {site.versions.map((v) => (
        <li key={v.n} className={v.current ? "cur" : ""}>
          <span className="tl-dot" />
          <div className="tl-body">
            <p><b>Version {v.n}</b>{v.current && <span className="tag-ok">en ligne</span>}</p>
            <p className="muted">{when(v.createdAt)} · {v.files} fichier(s) · {fmtBytes(v.size)}</p>
            {v.note && <p className="tl-note">{v.note}</p>}
          </div>
          {!v.current && <button type="button" className="sm" disabled={disabled} onClick={() => void onRollback(v.n)}><Icon name="rotate" size={15} />Remettre en ligne</button>}
        </li>
      ))}
    </ol>
  );
}

/* ========================= Déploiement depuis Git (sans compilation) ========================= */
function CopyRow({ label, value }: { label: string; value: string }) {
  return <div className="git-copy"><span className="git-copy-l">{label}</span><code>{value}</code><CopyButton value={value} label="Copier" /></div>;
}

function GitPanel({ site, disabled, busy, onSave, onDeploy, onRegen, onRemove, onPoll }: {
  site: SiteView; disabled: boolean; busy: string; onSave: (b: { url: string; branch: string; dir: string; auto: boolean }) => void | Promise<void>;
  onDeploy: () => void | Promise<void>; onRegen: (b: { key?: boolean; secret?: boolean }) => void | Promise<void>; onRemove: () => void | Promise<void>; onPoll: (s: SiteView) => void;
}) {
  const g: SiteGit | null | undefined = site.git;
  const [url, setUrl] = useState(g?.url ?? ""); const [branch, setBranch] = useState(g?.branch ?? "main"); const [dir, setDir] = useState(g?.dir ?? ""); const [auto, setAuto] = useState(g?.auto ?? true);
  const [confirm, setConfirm] = useState<"" | "key" | "secret" | "remove">("");
  useEffect(() => { setUrl(site.git?.url ?? ""); setBranch(site.git?.branch ?? "main"); setDir(site.git?.dir ?? ""); setAuto(site.git?.auto ?? true); }, [site.id, site.git?.url, site.git?.branch, site.git?.dir, site.git?.auto]);
  const running = g?.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => { sitesApi.get(site.id).then(onPoll).catch(() => undefined); }, 2500);
    return () => window.clearInterval(t);
  }, [running, site.id, onPoll]);
  const urlErr = url.trim() ? repoUrlError(url) : "";
  const cleanDir = dir.trim().replace(/^\/+|\/+$/g, "");
  const changed = !g || g.url !== url.trim() || g.branch !== (branch.trim() || "main") || g.dir !== cleanDir || g.auto !== auto;
  const step = (n: number) => (g?.private ? n + 1 : n);
  return (
    <div className="git">
      <p className="muted">Reliez un dépôt <b>GitHub, GitLab, Bitbucket</b> ou Gitea : à chaque déploiement, nous récupérons la branche choisie et publions ses fichiers <b>tels quels</b>. Aucune compilation n'est faite sur le serveur : si votre site doit être compilé, poussez le dossier généré (par exemple <code>dist</code>).</p>
      <label>Adresse du dépôt<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/compte/mon-site.git" disabled={disabled} aria-invalid={!!urlErr} /></label>
      {urlErr && <p className="field-err">{urlErr}</p>}
      {url.trim() && !urlErr && <p className="muted small">{isSshRepo(url) ? "Dépôt privé (SSH) : une clé de déploiement sera générée, à ajouter en lecture seule dans les réglages du dépôt." : "Dépôt public (HTTPS). Pour un dépôt privé, utilisez l'adresse SSH (git@github.com:compte/depot.git)."}</p>}
      <div className="two-col">
        <label>Branche<input value={branch} onChange={(e) => setBranch(e.target.value)} disabled={disabled} /></label>
        <label>Dossier à publier <span className="muted">(facultatif)</span><input value={dir} onChange={(e) => setDir(e.target.value)} placeholder="racine du dépôt, ou dist, public…" disabled={disabled} /></label>
      </div>
      <label className="switch-row">
        <span><b>Déploiement automatique</b><small>Chaque <code>git push</code> sur la branche met le site à jour (webhook).</small></span>
        <span className="switch"><input type="checkbox" role="switch" checked={auto} onChange={(e) => setAuto(e.target.checked)} disabled={disabled} /><i /></span>
      </label>
      <div className="row-actions">
        <button type="button" className="primary" disabled={disabled || busy === "git" || !url.trim() || !!urlErr || !changed} onClick={() => void onSave({ url: url.trim(), branch: branch.trim() || "main", dir: dir.trim(), auto })}>{busy === "git" ? "Enregistrement…" : g ? "Enregistrer les changements" : "Connecter le dépôt"}</button>
        {g && <button type="button" disabled={disabled} onClick={() => setConfirm("remove")}><Icon name="trash" size={16} />Déconnecter</button>}
      </div>
      {confirm === "remove" && <p className="alert warn"><Icon name="alert" size={18} /><span>Déconnecter ce dépôt ? Le site reste en ligne. <button type="button" className="link" onClick={() => { setConfirm(""); void onRemove(); }}>Oui, déconnecter</button> · <button type="button" className="link" onClick={() => setConfirm("")}>Annuler</button></span></p>}
      {g && (
        <>
          <h3 className="sub">Déployer</h3>
          <div className={`git-status git-${g.status}`} role="status">
            <b>{GIT_STATUS_LABEL[g.status] ?? g.status}</b>
            {g.message && <span> — {g.message}</span>}
            {g.status === "ok" && <span className="muted"> {g.version ? `Version ${g.version}` : ""}{g.commit ? ` · ${g.commit.slice(0, 7)}` : ""}{g.subject ? ` « ${g.subject} »` : ""}{g.trigger ? ` (${g.trigger})` : ""}</span>}
            {g.finishedAt && <small className="muted"> {when(g.finishedAt)}</small>}
          </div>
          <div className="row-actions"><button type="button" className="primary" disabled={disabled || running || changed} onClick={() => void onDeploy()}><Icon name="rotate" size={17} />{running ? "Déploiement en cours…" : "Déployer maintenant"}</button></div>
          {changed && <p className="muted small">Enregistrez vos changements avant de déployer.</p>}
          {g.private && g.deployKey && (
            <>
              <h3 className="sub">1. Clé de déploiement (dépôt privé)</h3>
              <p className="muted">Dans GitHub : dépôt → Settings → Deploy keys → Add deploy key. Collez cette clé et laissez « Allow write access » décoché.</p>
              <CopyRow label="Clé publique" value={g.deployKey} />
              <div className="row-actions">
                <button type="button" disabled={disabled} onClick={() => setConfirm("key")}>Régénérer la clé</button>
              </div>
              {confirm === "key" && <p className="alert warn"><Icon name="alert" size={18} /><span>L'ancienne clé cessera de fonctionner. <button type="button" className="link" onClick={() => { setConfirm(""); void onRegen({ key: true }); }}>Générer une nouvelle clé</button> · <button type="button" className="link" onClick={() => setConfirm("")}>Annuler</button></span></p>}
            </>
          )}
          {g.auto && (
            <>
              <h3 className="sub">{step(1)}. Webhook (déploiement automatique)</h3>
              <p className="muted">Dans le dépôt → Settings → Webhooks → Add webhook : collez l'adresse, choisissez « application/json », collez le secret, événement « Just the push event ».</p>
              <CopyRow label="Adresse" value={hookUrl(site.id)} />
              <CopyRow label="Secret" value={g.webhook.secret} />
              <div className="row-actions"><button type="button" disabled={disabled} onClick={() => setConfirm("secret")}>Régénérer le secret</button></div>
              {confirm === "secret" && <p className="alert warn"><Icon name="alert" size={18} /><span>Pensez à mettre à jour le webhook ensuite. <button type="button" className="link" onClick={() => { setConfirm(""); void onRegen({ secret: true }); }}>Générer un nouveau secret</button> · <button type="button" className="link" onClick={() => setConfirm("")}>Annuler</button></span></p>}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Locked({ children, onOffers }: { children: React.ReactNode; onOffers: () => void }) {
  return <div className="locked"><span className="empty-ico"><Icon name="lock" size={24} /></span><p>{children}</p><button type="button" className="primary" onClick={onOffers}>Voir les offres</button></div>;
}

function EnvEditor({ site, allowed, disabled, onSave, onOffers }: { site: SiteView; allowed: boolean; disabled: boolean; onSave: (env: Record<string, string>) => void | Promise<void>; onOffers: () => void }) {
  const [rows, setRows] = useState<[string, string][]>(Object.entries(site.env));
  useEffect(() => setRows(Object.entries(site.env)), [site.env]);
  if (!allowed) return <Locked onOffers={onOffers}>Les variables d'environnement sont réservées à l'offre <b>Pro</b>.</Locked>;
  const bad = rows.some(([k]) => !/^[A-Z][A-Z0-9_]{0,39}$/.test(k)) || new Set(rows.map(([k]) => k)).size !== rows.length;
  return (
    <div>
      <p className="alert warn"><Icon name="alert" size={18} /><span><b>Ces valeurs sont publiques</b> : tout visiteur de votre site peut les lire. N'y mettez jamais de mot de passe ni de clé secrète.</span></p>
      <p className="muted">Utilisez <code>%%NOM%%</code> dans vos pages (ex. <code>%%API_URL%%</code>) : la valeur est insérée à la publication. Le fichier <code>/env.js</code> expose aussi <code>window.__ENV__.NOM</code>. Un changement s'applique sans republier.</p>
      {rows.length === 0 && <p className="muted pad">Aucune variable pour l'instant.</p>}
      {rows.map(([k, v], i) => (
        <div className="env-row" key={i}>
          <input aria-label="Nom" value={k} className="mono" placeholder="NOM_EN_MAJUSCULES" onChange={(e) => setRows(rows.map((r, j) => (j === i ? [e.target.value.toUpperCase(), r[1]] : r)))} />
          <input aria-label="Valeur" value={v} placeholder="valeur" onChange={(e) => setRows(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
          <button type="button" className="icon-btn" aria-label="Retirer la variable" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Icon name="trash" size={18} /></button>
        </div>
      ))}
      {bad && <p className="field-err">Noms : majuscules, chiffres et « _ », en commençant par une lettre, sans doublon.</p>}
      <div className="row-actions"><button type="button" onClick={() => setRows([...rows, ["", ""]])} disabled={rows.length >= 50}><Icon name="plus" size={17} />Ajouter une variable</button><button type="button" className="primary" disabled={disabled || bad} onClick={() => void onSave(Object.fromEntries(rows))}>Enregistrer</button></div>
    </div>
  );
}

function Dns({ rows }: { rows: { type: string; name: string; value: string }[] }) {
  return (
    <div className="dns" role="table" aria-label="Enregistrements DNS">
      <div className="dns-row dns-head" role="row"><span>Type</span><span>Nom</span><span>Valeur</span></div>
      {rows.map((r) => (
        <div className="dns-row" role="row" key={r.type + r.name}>
          <span><b className="dns-type">{r.type}</b></span>
          <span className="dns-cell"><code>{r.name}</code><CopyButton value={r.name} label="Copier" /></span>
          <span className="dns-cell"><code>{r.value}</code><CopyButton value={r.value} label="Copier" /></span>
        </div>
      ))}
    </div>
  );
}

function Domains({ site, max, disabled, busy, onAdd, onVerify, onRemove, onOffers }: { site: SiteView; max: number; disabled: boolean; busy: boolean; onAdd: (d: string) => void | Promise<void>; onVerify: (d: string) => void | Promise<void>; onRemove: (d: string) => void | Promise<void>; onOffers: () => void }) {
  const [d, setD] = useState("");
  if (!max) return <Locked onOffers={onOffers}>Les domaines personnalisés sont réservés à l'offre <b>Pro</b>. Votre site reste disponible à <b>{site.url.replace(/^https?:\/\//, "")}</b>.</Locked>;
  return (
    <div>
      <p className="muted">Reliez votre propre nom de domaine à ce site. {site.domains.length} / {max} utilisé(s).</p>
      {site.domains.map((x) => (
        <div className="domain" key={x.domain}>
          <div className="domain-head">
            <b>{x.domain}</b>
            <span className={`live live-${x.status === "verified" ? "live" : "draft"}`}><i />{x.status === "verified" ? "Vérifié" : "À vérifier"}</span>
            {x.status === "verified" && <small className={`tls tls-${x.tls}`}>{TLS_LABEL[x.tls]}</small>}
          </div>
          {x.status === "pending" && x.verification && (
            <div className="domain-step">
              <p className="muted">Chez votre registrar (Namecheap, OVH…), ajoutez <b>un</b> de ces enregistrements DNS, puis cliquez « Vérifier » :</p>
              <Dns rows={[{ type: "TXT", name: x.verification.txt.name, value: x.verification.txt.value }, { type: "CNAME", name: x.verification.cname.name, value: x.verification.cname.value }]} />
              <p className="muted small">Le CNAME convient aux sous-domaines (ex. www).</p>
            </div>
          )}
          {x.status === "verified" && x.tls !== "active" && x.target && (
            <div className="domain-step">
              <p className="muted">Dernière étape : <b>pointez le domaine vers notre serveur</b>, puis patientez quelques minutes : le certificat HTTPS est obtenu automatiquement.</p>
              <Dns rows={[...(x.target.a ? [{ type: "A", name: "@ (domaine principal)", value: x.target.a }] : []), { type: "CNAME", name: "www (sous-domaine)", value: x.target.cname }]} />
              <p className="muted small">Si votre domaine a un enregistrement AAAA (IPv6), supprimez-le.</p>
            </div>
          )}
          <div className="row-actions">
            {x.status === "pending" && <button type="button" className="primary" disabled={busy} onClick={() => void onVerify(x.domain)}>Vérifier</button>}
            {x.status === "verified" && x.tls === "failed" && <button type="button" className="primary" disabled={busy} onClick={() => void onVerify(x.domain)}>Réessayer</button>}
            <button type="button" disabled={disabled || busy} onClick={() => void onRemove(x.domain)}><Icon name="trash" size={16} />Retirer</button>
          </div>
        </div>
      ))}
      {site.domains.length < max
        ? <form className="add-domain" onSubmit={(e) => { e.preventDefault(); if (d.trim()) { void onAdd(d.trim().toLowerCase()); setD(""); } }}><input value={d} onChange={(e) => setD(e.target.value)} placeholder="www.monentreprise.com" aria-label="Domaine" /><button className="primary" disabled={disabled || busy || !d.trim()}><Icon name="plus" size={17} />Ajouter</button></form>
        : <p className="muted">Limite atteinte : {max} domaine(s) par site.</p>}
    </div>
  );
}

function Settings({ site, disabled, onSave, onRemove }: { site: SiteView; disabled: boolean; onSave: (b: { name?: string; spa?: boolean }) => void | Promise<void>; onRemove: () => void | Promise<void> }) {
  const [name, setName] = useState(site.name); const [spa, setSpa] = useState(!!site.settings.spa); const [confirm, setConfirm] = useState("");
  useEffect(() => { setName(site.name); setSpa(!!site.settings.spa); setConfirm(""); }, [site]);
  return (
    <>
      <div className="block-card">
        <h2>Général</h2>
        <label>Nom du site<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
        <label className="switch-row">
          <span><b>Application monopage</b><small>Les adresses inconnues renvoient la page d'accueil (utile pour React, Vue, Flutter web…).</small></span>
          <span className="switch"><input type="checkbox" role="switch" checked={spa} onChange={(e) => setSpa(e.target.checked)} /><i /></span>
        </label>
        <div className="row-actions"><button type="button" className="primary" disabled={disabled || (name === site.name && spa === !!site.settings.spa)} onClick={() => void onSave({ name, spa })}>Enregistrer</button></div>
      </div>
      <div className="block-card danger-zone">
        <h2>Zone dangereuse</h2>
        <p className="muted">Supprimer le site efface définitivement ses fichiers, versions, variables et domaines. Tapez <b>{site.id}</b> pour confirmer.</p>
        <div className="inline"><input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Confirmation" placeholder={site.id} /><button type="button" className="danger" disabled={confirm !== site.id} onClick={() => void onRemove()}><Icon name="trash" size={17} />Supprimer définitivement</button></div>
      </div>
    </>
  );
}

/* ========================= Paiement de l'offre ========================= */
function PayModal({ offer, transfer, current, onClose, onSent }: { offer: SiteOffer; transfer: string; current: string | null; onClose: () => void; onSent: () => void }) {
  const choices = useMemo(() => offer.billing.filter((b) => b.id !== "monthly" || offer.id !== "site-starter" || current === "site-starter"), [offer, current]);
  const [b, setB] = useState(choices[0]?.id ?? "monthly");
  const [quote, setQuote] = useState<{ amountCents: number; creditCents: number } | null>(null);
  const [ref, setRef] = useState(""); const [phone, setPhone] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  useScrollLock(); useEscape(onClose);
  useEffect(() => { setErr(""); setQuote(null); sitesApi.quote(offer.id, b).then(setQuote).catch((e) => setErr(errMsg(e))); }, [offer.id, b]);
  const send = async () => {
    if (ref.trim().length < 3) { setErr("Indiquez la référence de votre transaction (reçue par SMS ou sur le reçu)."); return; }
    setBusy(true); setErr("");
    try { await sitesApi.request({ plan: offer.id, billing: b, reference: ref.trim(), phone: phone.trim() || undefined }); setDone(true); } catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };
  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="site-pay">
        <button type="button" className="close" onClick={onClose} aria-label="Fermer"><Icon name="x" size={18} /></button>
        <h2 id="site-pay">Offre {offer.label}</h2>
        {done ? <><p className="alert ok-a" role="status"><Icon name="check" size={18} />Demande envoyée. Votre offre sera activée dès que nous aurons vérifié le paiement (en général sous 24 h).</p><button type="button" className="full" onClick={onSent}>Fermer</button></> : (
          <>
            {offer.id === "site-starter" && current !== "site-starter" && <p className="muted">Le Starter se paie d'abord pour 5 mois ; vous pourrez ensuite payer au mois.</p>}
            <div className="seg wide" role="group" aria-label="Période">{choices.map((x) => <button type="button" key={x.id} className={b === x.id ? "on" : ""} aria-pressed={b === x.id} onClick={() => setB(x.id)}>{BILLING_SITE_LABEL[x.id]}</button>)}</div>
            <p className="pay-amount">{quote ? fmtUsdCents(quote.amountCents) : "…"}{quote && quote.creditCents > 0 && <span className="muted"> (crédit de votre offre actuelle : {fmtUsdCents(quote.creditCents)})</span>}</p>
            <ol className="pay-steps">
              <li>Envoyez {quote ? <b>{fmtUsdCents(quote.amountCents)}</b> : "le montant"} par mobile money au <b>{transfer}</b>.</li>
              <li>Saisissez la référence de la transaction ci-dessous.</li>
              <li>Nous vérifions le paiement puis activons votre offre.</li>
            </ol>
            <label>Référence de la transaction<input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ex. MP2611…" /></label>
            <label>Numéro d'envoi <span className="muted">(facultatif)</span><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></label>
            <button type="button" className="primary big full" disabled={busy || !quote} onClick={() => void send()}>{busy ? "Envoi…" : "J'ai payé : envoyer ma demande"}</button>
          </>
        )}
        {err && <p className="alert err" role="alert"><Icon name="alert" size={18} />{err}</p>}
      </div>
    </div>
  );
}
