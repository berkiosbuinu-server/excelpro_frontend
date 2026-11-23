import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { archiveOf, pick } from "./zip";
import { BILLING_SITE_LABEL, SITES_DOMAIN, SITE_ID_RE, TLS_LABEL, accessNotice, fmtBytes, fmtUsdCents, sitesApi, slugify, type SiteOffer, type SitePlan, type SiteRow, type SiteView } from "./sites";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erreur inconnue");
type Tab = "publish" | "versions" | "env" | "domains" | "settings";
const TABS: [Tab, string][] = [["publish", "Publier"], ["versions", "Versions"], ["env", "Variables"], ["domains", "Domaines"], ["settings", "Réglages"]];

/** Page « Mes sites web » : abonnement, création, publication (dossier ou ZIP), versions, variables, domaines. */
export function Sites({ transferNumber }: { transferNumber: string }) {
  const [plan, setPlan] = useState<SitePlan | null>(null);
  const [rows, setRows] = useState<SiteRow[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [site, setSite] = useState<SiteView | null>(null);
  const [tab, setTab] = useState<Tab>("publish");
  const [error, setError] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState("");
  const [paying, setPaying] = useState<SiteOffer | null>(null);

  const refresh = useCallback(async () => {
    try { const p = await sitesApi.plan(); setPlan(p); setRows(p.plan ? await sitesApi.list() : []); setError(""); } catch (e) { setError(errMsg(e)); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!sel) { setSite(null); return; } sitesApi.get(sel).then(setSite).catch((e) => setError(errMsg(e))); }, [sel]);

  const act = async <T,>(label: string, fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
    setBusy(label); setError(""); setMsg("");
    try { const r = await fn(); if (ok) setMsg(ok); return r; } catch (e) { setError(errMsg(e)); } finally { setBusy(""); }
  };
  const update = (s: SiteView) => { setSite(s); void refresh(); };
  const canWrite = plan?.access.state === "active";
  const notice = plan ? accessNotice(plan.access) : null;

  if (!plan && !error) return <section className="hosting-shell"><div className="hosting-loading"><span className="hosting-spinner" />Chargement de vos sites…</div></section>;
  return (
    <section className="hosting-shell sites">
      <header className="sites-head">
        <div><h1>Mes <span>sites web</span></h1><p className="muted">Publiez le site créé avec BERKIOS Graphic (ou n'importe quel site statique) à une adresse en ligne, en quelques clics.</p></div>
        {plan?.plan && <div className="sites-plan"><b>Offre {plan.label}</b><span>{plan.usage.sites} / {plan.limits?.sites} site(s) · {fmtBytes(plan.usage.storageBytes)}</span>{plan.access.expiresAt && <span>jusqu'au {plan.access.expiresAt.slice(0, 10)}</span>}</div>}
      </header>
      {error && <div className="hosting-alert plan-expired" role="alert"><b>!</b><span>{error}</span></div>}
      {notice && <div className={`hosting-alert ${notice.level === "info" ? "plan-trial" : "plan-expired"}`} role="status"><b>{notice.level === "info" ? "i" : "!"}</b><span>{notice.text} <button className="link" onClick={() => document.getElementById("sites-offers")?.scrollIntoView({ behavior: "smooth" })}>Voir les offres</button></span></div>}
      {plan?.pending && <div className="hosting-alert plan-trial"><b>i</b><span>Paiement en cours de vérification : offre {plan.pending.plan === "site-pro" ? "Pro" : "Starter"}, {fmtUsdCents(plan.pending.amountCents)} (référence {plan.pending.reference}). Activation en général sous 24 h.</span></div>}
      {msg && <p className="ok-msg" role="status">{msg}</p>}

      {plan?.plan && (
        <div className="sites-layout">
          <aside className="card sites-list">
            <h3>Vos sites</h3>
            {rows.length === 0 && <p className="muted">Aucun site pour l'instant.</p>}
            <ul>{rows.map((r) => <li key={r.id}><button className={sel === r.id ? "active" : ""} onClick={() => { setSel(r.id); setTab("publish"); setMsg(""); }}><b>{r.name}</b><small>{r.id}.{SITES_DOMAIN}</small><small>{r.currentVersion ? `version ${r.currentVersion}` : "pas encore publié"}</small></button></li>)}</ul>
            {canWrite && <CreateSite busy={busy === "create"} limitReached={rows.length >= (plan.limits?.sites ?? 0)} onCreate={async (id, name) => { const s = await act("create", () => sitesApi.create(id, name), "Site créé : publiez maintenant vos fichiers."); if (s) { setSel(s.id); setSite(s); setTab("publish"); void refresh(); } }} />}
          </aside>
          <div className="card sites-main">
            {!site ? <p className="muted">Choisissez un site, ou créez-en un.</p> : (
              <>
                <div className="sites-title"><h2>{site.name}</h2><a href={site.url} target="_blank" rel="noreferrer">{site.url}</a></div>
                <div className="billing" role="tablist" aria-label="Sections du site">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setMsg(""); }}>{l}</button>)}</div>
                {tab === "publish" && <Publish site={site} disabled={!canWrite} busy={busy === "deploy"} onDeploy={async (blob, note) => { const s = await act("deploy", () => sitesApi.deploy(site.id, blob, note)); if (s) { update(s); setMsg(`Version ${s.deployed?.version} en ligne (${s.deployed?.files} fichiers, ${fmtBytes(s.deployed?.bytes ?? 0)}${s.deployed?.ignored ? `, ${s.deployed.ignored} fichier(s) caché(s) ignoré(s)` : ""}).`); } }} />}
                {tab === "versions" && <Versions site={site} disabled={!canWrite} onRollback={async (n) => { const s = await act("rb", () => sitesApi.rollback(site.id, n), `Version ${n} remise en ligne.`); if (s) update(s); }} />}
                {tab === "env" && <EnvEditor site={site} allowed={!!plan.limits?.env} disabled={!canWrite} onSave={async (env) => { const s = await act("env", () => sitesApi.setEnv(site.id, env), "Variables enregistrées et appliquées au site."); if (s) update(s); }} />}
                {tab === "domains" && <Domains site={site} max={plan.limits?.domains ?? 0} disabled={!canWrite}
                  onAdd={async (d) => { const s = await act("dom", () => sitesApi.addDomain(site.id, d)); if (s) update(s); }}
                  onVerify={async (d) => { const r = await act("dom", () => sitesApi.verifyDomain(site.id, d)); if (r) { update(r.site); setMsg(r.verified ? `${d} est vérifié.` : "Pas encore détecté : l'enregistrement DNS peut mettre du temps à se propager. Réessayez dans quelques minutes."); } }}
                  onRemove={async (d) => { const s = await act("dom", () => sitesApi.removeDomain(site.id, d)); if (s) update(s); }} />}
                {tab === "settings" && <Settings site={site} disabled={!canWrite} onSave={async (b) => { const s = await act("set", () => sitesApi.settings(site.id, b), "Réglages enregistrés."); if (s) update(s); }}
                  onRemove={async () => { const r = await act("rm", () => sitesApi.remove(site.id)); if (r) { setSel(null); setSite(null); void refresh(); setMsg("Site supprimé."); } }} />}
              </>
            )}
          </div>
        </div>
      )}

      <div id="sites-offers" className="sites-offers">
        <h2>{plan?.plan ? "Changer d'offre ou renouveler" : "Choisissez une offre pour publier votre site"}</h2>
        <div className="plan-grid">
          {(plan?.offers ?? []).map((o) => (
            <div key={o.id} className={`card plan${o.id === "site-pro" ? " featured" : ""}`}>
              <h3>{o.label}</h3>
              <p className="price">{o.monthlyUsd} $ <small>/ mois</small></p>
              <ul><li>{o.sites} site{o.sites > 1 ? "s" : ""} · {o.storageMb >= 1024 ? `${o.storageMb / 1024} Go` : `${o.storageMb} Mo`} par site</li><li>{o.versions} versions et retour arrière</li><li>{o.domains ? `Domaines personnalisés (${o.domains} par site)` : "Adresse .sites.berkios.online"}</li><li>{o.env ? "Variables d'environnement" : "Sans variables d'environnement"}</li></ul>
              <button className={o.id === "site-pro" ? "primary" : ""} onClick={() => setPaying(o)}>Choisir {o.label}</button>
            </div>
          ))}
        </div>
      </div>
      {paying && <PayModal offer={paying} transfer={transferNumber} current={plan?.plan ?? null} onClose={() => setPaying(null)} onSent={() => { setPaying(null); void refresh(); }} />}
    </section>
  );
}

function CreateSite({ onCreate, busy, limitReached }: { onCreate: (id: string, name: string) => void | Promise<void>; busy: boolean; limitReached: boolean }) {
  const [name, setName] = useState(""); const [id, setId] = useState(""); const [touched, setTouched] = useState(false);
  const valid = SITE_ID_RE.test(id) && !id.endsWith("-") && !id.includes("--");
  if (limitReached) return <p className="muted">Limite de sites atteinte pour votre offre. Passez à une offre supérieure pour en créer d'autres.</p>;
  return (
    <form className="sites-create" onSubmit={(e) => { e.preventDefault(); if (valid) void onCreate(id, name.trim() || id); }}>
      <h4>Nouveau site</h4>
      <label>Nom<input value={name} onChange={(e) => { setName(e.target.value); if (!touched) setId(slugify(e.target.value)); }} placeholder="Ma pharmacie" /></label>
      <label>Adresse<span className="sites-addr"><input value={id} onChange={(e) => { setTouched(true); setId(e.target.value.toLowerCase()); }} aria-label="Identifiant du site" /><em>.{SITES_DOMAIN}</em></span></label>
      {id && !valid && <small className="error">3 à 40 caractères : minuscules, chiffres et tirets, en commençant par une lettre.</small>}
      <button className="primary" disabled={!valid || busy}>{busy ? "Création…" : "Créer le site"}</button>
    </form>
  );
}

function Publish({ site, disabled, busy, onDeploy }: { site: SiteView; disabled: boolean; busy: boolean; onDeploy: (blob: Blob, note: string) => void | Promise<void> }) {
  const [picked, setPicked] = useState(pick(null)); const [note, setNote] = useState(""); const [err, setErr] = useState("");
  const dirRef = useRef<HTMLInputElement>(null);
  useEffect(() => { dirRef.current?.setAttribute("webkitdirectory", ""); dirRef.current?.setAttribute("directory", ""); }, []);
  const label = picked.kind === "zip" ? `${picked.file.name} (${fmtBytes(picked.file.size)})` : picked.kind === "files" ? `${picked.files.length} fichier(s)` : "";
  const go = async () => { setErr(""); try { await onDeploy(await archiveOf(picked), note.trim()); setPicked(pick(null)); setNote(""); } catch (e) { setErr(errMsg(e)); } };
  return (
    <div className="sites-publish">
      <p>Choisissez le <b>dossier</b> généré par BERKIOS Graphic (Déploiements → Web → « Site web (HTML) »), ou une archive <b>.zip</b> de ce dossier. La page d'accueil doit s'appeler <code>index.html</code>.</p>
      <div className="sites-pickers">
        <label className="button-like">Choisir un dossier<input ref={dirRef} type="file" multiple hidden onChange={(e) => setPicked(pick(e.target.files))} /></label>
        <label className="button-like">Choisir un fichier .zip<input type="file" accept=".zip,application/zip" hidden onChange={(e) => setPicked(pick(e.target.files))} /></label>
      </div>
      {label && <p className="ok-msg">Sélection : {label}</p>}
      <label>Note de version (facultatif)<input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="ex. nouvelle page Contact" /></label>
      <button className="primary" disabled={disabled || busy || picked.kind === "empty"} onClick={() => void go()}>{busy ? "Publication…" : site.currentVersion ? "Publier une nouvelle version" : "Mettre en ligne"}</button>
      {disabled && <p className="muted">Votre offre n'est pas active : la publication est suspendue.</p>}
      {err && <p className="error" role="alert">{err}</p>}
      <p className="muted">Les fichiers cachés (comme <code>.env</code> ou <code>.git</code>) ne sont jamais publiés.</p>
    </div>
  );
}

function Versions({ site, disabled, onRollback }: { site: SiteView; disabled: boolean; onRollback: (n: number) => void | Promise<void> }) {
  if (!site.versions.length) return <p className="muted">Aucune version publiée.</p>;
  return (
    <table className="sites-table"><thead><tr><th>Version</th><th>Date</th><th>Fichiers</th><th>Taille</th><th>Note</th><th /></tr></thead>
      <tbody>{site.versions.map((v) => <tr key={v.n}><td>v{v.n} {v.current && <span className="badge-n">en ligne</span>}</td><td>{v.createdAt.slice(0, 16).replace("T", " ")}</td><td>{v.files}</td><td>{fmtBytes(v.size)}</td><td>{v.note || "—"}</td><td>{!v.current && <button disabled={disabled} onClick={() => void onRollback(v.n)}>Remettre en ligne</button>}</td></tr>)}</tbody></table>
  );
}

function EnvEditor({ site, allowed, disabled, onSave }: { site: SiteView; allowed: boolean; disabled: boolean; onSave: (env: Record<string, string>) => void | Promise<void> }) {
  const [rows, setRows] = useState<[string, string][]>(Object.entries(site.env));
  useEffect(() => setRows(Object.entries(site.env)), [site.env]);
  if (!allowed) return <p className="muted">Les variables d'environnement sont réservées à l'offre <b>Pro</b>.</p>;
  const bad = rows.some(([k]) => !/^[A-Z][A-Z0-9_]{0,39}$/.test(k)) || new Set(rows.map(([k]) => k)).size !== rows.length;
  return (
    <div>
      <p className="notice-inline"><b>Ces valeurs sont publiques</b> : tout visiteur de votre site peut les lire. N'y mettez jamais de mot de passe ni de clé secrète.</p>
      <p className="muted">Utilisez <code>%%NOM%%</code> dans vos pages (ex. <code>%%API_URL%%</code>) : la valeur est insérée à la publication. Le fichier <code>/env.js</code> expose aussi <code>window.__ENV__.NOM</code>. Un changement s'applique sans republier.</p>
      {rows.map(([k, v], i) => (
        <div className="sites-env-row" key={i}>
          <input aria-label="Nom" value={k} placeholder="NOM_EN_MAJUSCULES" onChange={(e) => setRows(rows.map((r, j) => (j === i ? [e.target.value.toUpperCase(), r[1]] : r)))} />
          <input aria-label="Valeur" value={v} placeholder="valeur" onChange={(e) => setRows(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
          <button aria-label="Retirer" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <div className="sites-actions"><button onClick={() => setRows([...rows, ["", ""]])} disabled={rows.length >= 50}>+ Ajouter une variable</button><button className="primary" disabled={disabled || bad} onClick={() => void onSave(Object.fromEntries(rows))}>Enregistrer</button></div>
      {bad && <small className="error">Noms : majuscules, chiffres et « _ », en commençant par une lettre, sans doublon.</small>}
    </div>
  );
}

function Domains({ site, max, disabled, onAdd, onVerify, onRemove }: { site: SiteView; max: number; disabled: boolean; onAdd: (d: string) => void | Promise<void>; onVerify: (d: string) => void | Promise<void>; onRemove: (d: string) => void | Promise<void> }) {
  const [d, setD] = useState("");
  if (!max) return <p className="muted">Les domaines personnalisés sont réservés à l'offre <b>Pro</b>. Votre site reste disponible à <b>{site.url}</b>.</p>;
  return (
    <div>
      {site.domains.map((x) => (
        <div className="card sites-domain" key={x.domain}>
          <div className="sites-domain-head"><b>{x.domain}</b><span className={`pbadge ${x.status === "verified" ? "ok" : ""}`}>{x.status === "verified" ? "Vérifié" : "À vérifier"}</span>{x.status === "verified" && <small>{TLS_LABEL[x.tls]}</small>}</div>
          {x.status === "pending" && x.verification && (
            <div className="muted">
              <p>Chez votre registrar (Namecheap, OVH…), ajoutez <b>un</b> de ces enregistrements DNS, puis cliquez « Vérifier » :</p>
              <ul><li>TXT — nom <code>{x.verification.txt.name}</code> — valeur <code>{x.verification.txt.value}</code></li><li>ou CNAME (sous-domaine, ex. www) — nom <code>{x.verification.cname.name}</code> — valeur <code>{x.verification.cname.value}</code></li></ul>
            </div>
          )}
          {x.status === "verified" && x.tls !== "active" && x.target && (
            <div className="muted">
              <p>Dernière étape : <b>pointez le domaine vers notre serveur</b>, puis patientez quelques minutes : le certificat HTTPS est obtenu automatiquement.</p>
              <ul>{x.target.a && <li>Domaine principal (ex. monentreprise.com) : enregistrement <b>A</b> vers <code>{x.target.a}</code></li>}<li>Sous-domaine (ex. www) : enregistrement <b>CNAME</b> vers <code>{x.target.cname}</code></li></ul>
              <small>Si votre domaine a un enregistrement AAAA (IPv6), supprimez-le.</small>
            </div>
          )}
          <div className="sites-actions">{x.status === "pending" && <button className="primary" onClick={() => void onVerify(x.domain)}>Vérifier</button>}{x.status === "verified" && x.tls === "failed" && <button className="primary" onClick={() => void onVerify(x.domain)}>Réessayer</button>}<button disabled={disabled} onClick={() => void onRemove(x.domain)}>Retirer</button></div>
        </div>
      ))}
      {site.domains.length < max
        ? <form className="sites-add" onSubmit={(e) => { e.preventDefault(); if (d.trim()) { void onAdd(d.trim().toLowerCase()); setD(""); } }}><input value={d} onChange={(e) => setD(e.target.value)} placeholder="www.monentreprise.com" aria-label="Domaine" /><button className="primary" disabled={disabled || !d.trim()}>Ajouter</button></form>
        : <p className="muted">Limite atteinte : {max} domaine(s) par site.</p>}
    </div>
  );
}

function Settings({ site, disabled, onSave, onRemove }: { site: SiteView; disabled: boolean; onSave: (b: { name?: string; spa?: boolean }) => void | Promise<void>; onRemove: () => void | Promise<void> }) {
  const [name, setName] = useState(site.name); const [spa, setSpa] = useState(!!site.settings.spa); const [confirm, setConfirm] = useState("");
  useEffect(() => { setName(site.name); setSpa(!!site.settings.spa); setConfirm(""); }, [site]);
  return (
    <div>
      <label>Nom du site<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={spa} onChange={(e) => setSpa(e.target.checked)} /> Application monopage : les adresses inconnues renvoient la page d'accueil</label>
      <button className="primary" disabled={disabled} onClick={() => void onSave({ name, spa })}>Enregistrer</button>
      <hr />
      <h4>Supprimer le site</h4>
      <p className="muted">Les fichiers, versions, variables et domaines sont supprimés définitivement. Tapez <b>{site.id}</b> pour confirmer.</p>
      <input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Confirmation" />
      <button className="danger" disabled={confirm !== site.id} onClick={() => void onRemove()}>Supprimer définitivement</button>
    </div>
  );
}

function PayModal({ offer, transfer, current, onClose, onSent }: { offer: SiteOffer; transfer: string; current: string | null; onClose: () => void; onSent: () => void }) {
  const choices = useMemo(() => offer.billing.filter((b) => b.id !== "monthly" || offer.id !== "site-starter" || current === "site-starter"), [offer, current]);
  const [b, setB] = useState(choices[0]?.id ?? "monthly");
  const [quote, setQuote] = useState<{ amountCents: number; creditCents: number } | null>(null);
  const [ref, setRef] = useState(""); const [phone, setPhone] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  useEffect(() => { setErr(""); setQuote(null); sitesApi.quote(offer.id, b).then(setQuote).catch((e) => setErr(errMsg(e))); }, [offer.id, b]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [onClose]);
  const send = async () => {
    if (ref.trim().length < 3) { setErr("Indiquez la référence de votre transaction (reçue par SMS ou sur le reçu)."); return; }
    setBusy(true); setErr("");
    try { await sitesApi.request({ plan: offer.id, billing: b, reference: ref.trim(), phone: phone.trim() || undefined }); setDone(true); } catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="site-pay" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Fermer">✕</button>
        <h2 id="site-pay">Offre {offer.label}</h2>
        {done ? <><p className="ok-msg" role="status">Demande envoyée. Votre offre sera activée dès que nous aurons vérifié le paiement (en général sous 24 h).</p><button onClick={onSent}>Fermer</button></> : (
          <>
            {offer.id === "site-starter" && current !== "site-starter" && <p className="muted">Le Starter se paie d'abord pour 5 mois ; vous pourrez ensuite payer au mois.</p>}
            <div className="billing" role="group" aria-label="Période">{choices.map((x) => <button key={x.id} className={b === x.id ? "on" : ""} onClick={() => setB(x.id)}>{BILLING_SITE_LABEL[x.id]}</button>)}</div>
            {quote && <p><b style={{ fontSize: "1.4rem" }}>{fmtUsdCents(quote.amountCents)}</b>{quote.creditCents > 0 && <span className="muted"> (crédit de votre offre actuelle : {fmtUsdCents(quote.creditCents)})</span>}</p>}
            <ol className="muted" style={{ paddingLeft: 18 }}><li>Envoyez {quote ? <b>{fmtUsdCents(quote.amountCents)}</b> : "le montant"} par mobile money au <b>{transfer}</b>.</li><li>Saisissez la référence de la transaction ci-dessous.</li><li>Nous vérifions le paiement puis activons votre offre.</li></ol>
            <label>Référence de la transaction<input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ex. MP2611…" /></label>
            <label>Numéro d'envoi (facultatif)<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></label>
            <button className="primary" disabled={busy || !quote} onClick={() => void send()}>{busy ? "Envoi…" : "J'ai payé : envoyer ma demande"}</button>
          </>
        )}
        {err && <p className="error" role="alert">{err}</p>}
      </div>
    </div>
  );
}
