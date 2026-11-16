import { useEffect, useState } from "react";
import {
  api, setToken, hasToken, downloadDelivery, downloadSource, money, openProof,
  type Order, type Pricing, type Conversation, type Delivery, type CheckReport, type ItemStatus, type Verdict, type ChecklistRow, type CheckItem,
} from "./api";
import { PayModal } from "./PayModal";
import { Runner } from "./Runner";
import Hosting  from "./Hosting";
import { ChatWidget } from "./Chat";
import { DevicesShowcase, Logo, PlatformBadge, PlatformIcon, PLATFORM_COLORS } from "./visuals";

type Page = "home" | "login" | "submit" | "studio" | "orders" | "hosting" | "admin";
const LABELS: Record<string, string> = {
  windows: "Windows", android: "Android", linux: "Linux", ios: "iOS", macos: "macOS", web: "Web",
};
const STATUS: Record<string, string> = {
  submitted: "Vérification à payer", checking: "Vérification en cours", report_ready: "Rapport disponible",
  in_progress: "Conversion en cours", ready: "Prête",
};
const VERDICTS: Record<string, string> = {
  convertible: "Convertible en l'état", convertible_with_changes: "Convertible après adaptations", not_convertible: "Non convertible en l'état",
};
const ITEM_STATUS: Record<string, string> = { ok: "Fonctionne", partial: "Partiellement", fail: "Ne fonctionne pas" };
const ITEM_ICON: Record<string, string> = { ok: "✔", partial: "~", fail: "✖" };
const CATEGORIES: Record<string, string> = {
  feuilles: "Feuilles", formules: "Formules", vba: "Macros VBA", userforms: "UserForms", donnees: "Données", autre: "Autres éléments",
};
const PROVIDERS: Record<string, string> = { stripe: "carte", mpesa: "M-PESA", orange: "Orange Money", airtel: "Airtel Money", transfer: "transfert mobile money" };
const PAY_STATUS: Record<string, string> = { pending: "en attente de vérification", succeeded: "confirmé", failed: "refusé" };

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Erreur inconnue";
}

const STEPS = ["submitted", "checking", "report_ready", "in_progress", "ready"] as const;
const STEP_SHORT = ["Soumise", "Vérification", "Rapport", "Conversion", "Prête"];

export default function App() {
  const [page, setPage] = useState<Page>(hasToken() ? "studio" : "home");
  const [role, setRole] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [menu, setMenu] = useState(false);
  const [next, setNext] = useState<Page>("studio");
  const [payNotice, setPayNotice] = useState("");
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);

  useEffect(() => { api.pricing().then(setPricing).catch(() => undefined); }, []);
  useEffect(() => {
    if (!hasToken()) return;
    api.me().then((m) => { setRole(m.role); setEmail(m.email); })
      .catch(() => { setToken(null); setPage("home"); });
  }, []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("payment");
    if (q === "success") setPayNotice("Paiement reçu : votre commande est en cours de validation. Merci !");
    if (q === "cancelled") setPayNotice("Paiement annulé : aucun montant n'a été débité.");
    if (q) window.history.replaceState({}, "", window.location.pathname);
  }, []);
  useEffect(() => {
    if (page === "home" && pendingScroll) {
      document.getElementById(pendingScroll)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setPendingScroll(null);
    }
  }, [page, pendingScroll]);

  const onAuth = (token: string, r: string, mail: string) => {
    setToken(token); setRole(r); setEmail(mail); setPage(next); setNext("studio");
  };
  const logout = () => { setToken(null); setRole(null); setEmail(null); setPage("home"); setMenu(false); };
  const go = (p: Page) => { setPage(p); setMenu(false); window.scrollTo({ top: 0 }); };
  const start = () => { if (email) go("submit"); else { setNext("submit"); go("login"); } };
  const goSection = (id: string) => { setPendingScroll(id); setPage("home"); setMenu(false); };

  return (
    <>
      <header className="nav">
        <button className="brand" onClick={() => go("home")} aria-label="ExcelPro, accueil"><Logo /><span>ExcelPro</span></button>
        <button className="burger" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(!menu)}><span /><span /><span /></button>
        <nav className={menu ? "open" : ""}>
          <button className={page === "home" ? "active" : ""} onClick={() => go("home")}>Accueil</button>
          <button onClick={() => goSection("tarifs")}>Tarifs</button>
          <button onClick={() => goSection("hebergement")}>Hébergement</button>
          {email ? (
            <>
              <button className={page === "submit" ? "active" : ""} onClick={() => go("submit")}>Soumettre</button>
              <button className={page === "studio" ? "active" : ""} onClick={() => go("studio")}>Studio</button>
              <button className={page === "orders" ? "active" : ""} onClick={() => go("orders")}>Mes commandes</button>
              <button className={page === "hosting" ? "active" : ""} onClick={() => go("hosting")}>Mon hébergement</button>
              {role === "admin" && <button className={page === "admin" ? "active" : ""} onClick={() => go("admin")}>Administration</button>}
              <button onClick={logout}>Déconnexion</button>
            </>
          ) : (
            <button className="primary" onClick={() => go("login")}>Se connecter</button>
          )}
        </nav>
      </header>
      {payNotice && <div className="notice" role="status">{payNotice}<button onClick={() => setPayNotice("")} aria-label="Fermer">✕</button></div>}
      <main className={page === "home" ? "wide-main" : ""}>
        {page === "home" && <Home pricing={pricing} onStart={start} goSection={goSection} />}
        {page === "login" && <Login onAuth={onAuth} />}
        {page === "submit" && (email ? <NewOrder pricing={pricing} onCreated={() => go("orders")} /> : <Login onAuth={onAuth} />)}
        {page === "studio" && (email ? <Claim /> : <Login onAuth={onAuth} />)}
        {page === "orders" && (email ? <Orders pricing={pricing} /> : <Login onAuth={onAuth} />)}
        {page === "hosting" && (email ? <Hosting /> : <Login onAuth={onAuth} />)}
        {page === "admin" && role === "admin" && <Admin />}
      </main>
      <ChatWidget pricing={pricing} email={email} isAdmin={role === "admin"} onAdmin={() => go("admin")} />
      <footer className="footer"><Logo size={22} /> <span>ExcelPro — Votre Excel devient une application.</span></footer>
    </>
  );
}

function Home({ pricing, onStart, goSection }: { pricing: Pricing | null; onStart: () => void; goSection: (id: string) => void }) {
  return (
    <>
      <section className="hero">
        <div className="hero-text">
          <span className="eyebrow">Excel → application</span>
          <h1>Votre Excel. <em>Votre application.</em> Votre liberté.</h1>
          <p>Transformez votre fichier Excel en application pour Windows, Android, Linux, iOS, macOS et le Web, ou en solution multiutilisateur hébergée.</p>
          <div className="cta-row">
            <button className="primary big" onClick={onStart}>Soumettre mon application Excel</button>
            <button className="big ghost" onClick={() => goSection("tarifs")}>Tarifs</button>
            <button className="big ghost" onClick={() => goSection("hebergement")}>Hébergement</button>
          </div>
          <div className="plat-strip" aria-label="Plateformes prises en charge">
            {Object.keys(LABELS).map((k) => <span key={k} style={{ color: PLATFORM_COLORS[k] }} title={LABELS[k]}><PlatformIcon id={k} size={26} /></span>)}
          </div>
        </div>
        <DevicesShowcase />
      </section>

      <section className="how">
        {[
          ["1", "Envoyez votre classeur", "Déposez votre fichier .xlsx ou .xlsm. L'analyse est automatique."],
          ["2", "Recevez le rapport", "Nos experts testent macros, formules et UserForms avant toute conversion."],
          ["3", "Récupérez votre application", "Une clé de récupération vous donne accès à vos livrables, pour chaque plateforme."],
        ].map(([n, t, d]) => (
          <div className="step" key={n}><span className="num-badge">{n}</span><h3>{t}</h3><p className="muted">{d}</p></div>
        ))}
      </section>

      <section id="tarifs" className="block">
        <div className="head"><h2>Tarifs</h2><p className="muted">Applications autonomes — paiement unique par plateforme</p></div>
        <div className="grid plat-grid">
          {pricing && Object.entries(pricing.platforms).map(([k, v]) => (
            <div className="card plat-card" key={k} style={{ ["--pc" as string]: PLATFORM_COLORS[k] }}>
              <div className="plat-ico"><PlatformIcon id={k} size={34} /></div>
              <h3>{LABELS[k] ?? k}</h3>
              <p className="price">{v} $</p>
              <span className="muted">paiement unique</span>
            </div>
          ))}
        </div>
        {pricing && (
          <div className="card check-card">
            <div>
              <h3>Vérification de votre fichier avant conversion</h3>
              <p>
                Nos experts ouvrent et lancent votre application sur leurs machines : macros, VBA, formules, UserForms.
                Vous recevez un rapport détaillé <strong>avant</strong> de payer la conversion.
              </p>
              <ul className="rates">
                <li><strong>{pricing.check_fee_rates.per_interface} $</strong> par interface (feuille ou UserForm)</li>
                <li><strong>{pricing.check_fee_rates.per_macro} $</strong> par macro VBA</li>
                <li><strong>{pricing.check_fee_rates.per_formula} $</strong> par formule</li>
                <li><strong>{pricing.check_fee_rates.per_mb} $</strong> par Mo de fichier</li>
              </ul>
              <p className="muted">Calculé automatiquement dès l'envoi de votre fichier. Tarifs indicatifs, à valider.</p>
            </div>
            <div className="from"><span className="muted">À partir de</span><span className="price big-price">{pricing.check_fee_rates.minimum} $</span></div>
          </div>
        )}
      </section>

      <section id="hebergement" className="block">
        <div className="head"><h2>Hébergement</h2><p className="muted">Client-serveur hébergé — par mois</p></div>
        <div className="grid host-grid">
          {pricing?.hosting.map((h, i) => (
            <div className={`card host-card ${i === 1 ? "featured" : ""}`} key={h.name}>
              {i === 1 && <span className="ribbon">Populaire</span>}
              <h3>{h.name}</h3>
              <p className="price">{h.price_usd} $<small>/mois</small></p>
              <ul className="ticks"><li>{h.users} utilisateurs</li>{h.features.map((f) => <li key={f}>{f}</li>)}</ul>
              <button className={i === 1 ? "primary" : ""} onClick={onStart}>Choisir {h.name}</button>
            </div>
          ))}
        </div>
        <p className="muted center">Tarifs d'hébergement indicatifs, à valider.</p>
      </section>

      <section className="final-cta">
        <h2>Prêt à transformer votre Excel ?</h2>
        <button className="primary big" onClick={onStart}>Soumettre mon application Excel</button>
      </section>
    </>
  );
}

function Login({ onAuth }: { onAuth: (t: string, r: string, e: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const r = mode === "login" ? await api.login(email, password) : await api.register(email, password);
      onAuth(r.token, r.role, email.trim().toLowerCase());
    } catch (err) { setError(errMsg(err)); }
  };

  return (
    <form className="panel narrow" onSubmit={submit}>
      <h2>{mode === "login" ? "Connexion" : "Créer un compte"}</h2>
      <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Mot de passe (8 caractères min.)<input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      {error && <p className="error">{error}</p>}
      <button className="primary" type="submit">{mode === "login" ? "Se connecter" : "S'inscrire"}</button>
      <button type="button" className="link" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "Pas de compte ? Créer un compte" : "Déjà inscrit ? Se connecter"}
      </button>
    </form>
  );
}

function Orders({ pricing }: { pricing: Pricing | null }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const reload = () => api.myOrders().then(setOrders).catch(() => undefined);
  useEffect(() => { reload(); }, []);

  return (
    <section className="panel">
      <h2>Mes commandes</h2>
      {orders.length === 0 && <p className="muted">Aucune commande pour le moment.</p>}
      <div className="orders">
        {orders.map((o) => <OrderCard key={o.id} order={o} pricing={pricing} onDone={reload} />)}
      </div>
    </section>
  );
}

function OrderCard({ order: o, pricing, onDone }: { order: Order; pricing: Pricing | null; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const step = STEPS.indexOf(o.status);
  const purpose: "check" | "conversion" | null = !o.check_paid
    ? "check"
    : o.status === "report_ready" && !o.paid && o.check_report?.verdict !== "not_convertible" ? "conversion" : null;
  const amount = purpose === "check" ? o.check_fee_cents : o.total_usd * 100;

  return (
    <article className="order">
      <div className="order-top">
        <div className="order-title">
          <h3>{o.app_name}</h3>
          <div className="muted">{o.original_filename}</div>
        </div>
        <span className={`status s-${o.status}`}>{STATUS[o.status]}</span>
      </div>
      <div className="chips">{o.platforms.map((p) => <PlatformBadge key={p} id={p} label={LABELS[p] ?? p} />)}</div>
      <ol className="progress" aria-label="Avancement">
        {STEP_SHORT.map((t, i) => <li key={t} className={i < step ? "done" : i === step ? "cur" : ""}><span>{t}</span></li>)}
      </ol>
      <div className="amounts">
        <div><span className="muted">Vérification</span><strong>{money(o.check_fee_cents)}</strong><span className={o.check_paid ? "ok" : "warn"}>{o.check_paid ? "payée" : "à payer"}</span></div>
        <div><span className="muted">Conversion</span><strong>{o.total_usd} $</strong><span className={o.paid ? "ok" : "warn"}>{o.paid ? "payée" : "non payée"}</span></div>
      </div>
      {o.analysis?.warnings.map((w) => <div className="warn" key={w}>⚠ {w}</div>)}
      {o.payments.map((p) => (
        <div className="muted" key={p.id}>
          {p.purpose === "check" ? "Vérification" : "Conversion"} — {PROVIDERS[p.provider] ?? p.provider} : {PAY_STATUS[p.status]}{p.reference ? ` (${p.reference})` : ""}
        </div>
      ))}
      {o.check_report && <ReportView report={o.check_report} />}
      {purpose === null && o.check_report?.verdict === "not_convertible" && !o.paid && (
        <div className="warn-box">Ce fichier n'est pas convertible en l'état : contactez-nous pour étudier les adaptations possibles.</div>
      )}
      {purpose && (
        <div className="order-pay">
          <div>
            <strong>{purpose === "check" ? "Frais de vérification" : "Conversion"} : {money(amount)}</strong>
            {purpose === "check" && <div className="muted">Nos experts testeront votre fichier, puis vous recevrez le rapport avant toute conversion.</div>}
          </div>
          <button className="primary big pay-btn" onClick={() => setOpen(true)}>Payer {money(amount)}</button>
        </div>
      )}
      {open && purpose && <PayModal order={o} purpose={purpose} amount={amount} pricing={pricing} onClose={() => setOpen(false)} onDone={onDone} />}
    </article>
  );
}

function ReportView({ report }: { report: CheckReport }) {
  return (
    <details className="report" open>
      <summary><strong>Rapport de vérification</strong> — {VERDICTS[report.verdict]}</summary>
      {report.tested_on && <div className="muted">Testé sur : {report.tested_on}</div>}
      <p>{report.summary}</p>
      <div className="stats">
        {report.statistics.filter((s) => s.value > 0).map((s) => (
          <span key={s.label} className="chip">{s.label} : <strong>{s.value}</strong></span>
        ))}
      </div>
      {Object.entries(CATEGORIES).map(([cat, label]) => {
        const items = report.items.filter((i) => i.category === cat);
        return items.length === 0 ? null : (
          <div key={cat}>
            <h4>{label}</h4>
            {items.map((i, k) => (
              <div key={k} className={`item ${i.status}`}>
                <span>{ITEM_ICON[i.status]} <strong>{i.name}</strong> — {ITEM_STATUS[i.status]}</span>
                {i.details && <div className="muted">{i.details}</div>}
              </div>
            ))}
          </div>
        );
      })}
    </details>
  );
}

function ReportForm({ order, onDone }: { order: Order; onDone: () => void }) {
  const initial = (order.check_checklist ?? []).map((r: ChecklistRow) => ({ ...r, status: "" as ItemStatus | "", details: "" }));
  const [rows, setRows] = useState(initial);
  const [verdict, setVerdict] = useState<Verdict | "">("");
  const [summary, setSummary] = useState("");
  const [testedOn, setTestedOn] = useState("");
  const [error, setError] = useState("");

  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((cur) => cur.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!verdict) return setError("Choisissez un verdict");
    if (rows.some((r) => r.status === "")) return setError("Renseignez le résultat de chaque point testé");
    const items: CheckItem[] = rows.map((r) => ({ category: r.category, name: r.name, status: r.status as ItemStatus, details: r.details }));
    try {
      await api.adminSubmitReport(order.id, { verdict, summary, tested_on: testedOn, items });
      onDone();
    } catch (err) { setError(errMsg(err)); }
  };

  return (
    <form className="paybox" onSubmit={submit}>
      <strong>Rapport de checking — à remplir après avoir ouvert et testé le fichier</strong>
      <label>Environnement de test<input placeholder="Excel 365 / Windows 11" value={testedOn} onChange={(e) => setTestedOn(e.target.value)} /></label>
      {rows.map((r, i) => (
        <div key={i} className={`item ${r.hint}`}>
          <div>{r.hint === "risk" ? "⚠ " : ""}<strong>{CATEGORIES[r.category] ?? r.category} · {r.name}</strong> <span className="muted">{r.detail}</span></div>
          <div className="inline">
            <select value={r.status} onChange={(e) => setRow(i, { status: e.target.value as ItemStatus | "" })}>
              <option value="">— résultat —</option>
              <option value="ok">Fonctionne</option>
              <option value="partial">Partiellement</option>
              <option value="fail">Ne fonctionne pas</option>
            </select>
            <input placeholder="Constat (facultatif)" value={r.details} onChange={(e) => setRow(i, { details: e.target.value })} />
          </div>
        </div>
      ))}
      <label>Verdict
        <select value={verdict} onChange={(e) => setVerdict(e.target.value as Verdict | "")}>
          <option value="">— choisir —</option>
          {Object.entries(VERDICTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label>Synthèse pour le client<textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} required /></label>
      {error && <div className="error">{error}</div>}
      <button className="primary" type="submit">Envoyer le rapport au client</button>
    </form>
  );
}

function NewOrder({ pricing, onCreated }: { pricing: Pricing | null; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>(["windows"]);
  const [file, setFile] = useState<File | null>(null);
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const total = picked.reduce((s, p) => s + (pricing?.platforms[p] ?? 0), 0);

  const toggle = (p: string) => setPicked((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(""); setError("");
    if (!file) return setError("Choisissez un fichier Excel (.xlsx ou .xlsm)");
    if (picked.length === 0) return setError("Choisissez au moins une plateforme");
    const f = new FormData();
    f.append("app_name", name);
    f.append("platforms", picked.join(","));
    f.append("phone", phone);
    f.append("file", file);
    try {
      const created = await api.createOrder(f);
      setMsg(`Fichier reçu. Frais de vérification calculés : ${money(created.check_fee_cents)}. Redirection vers « Mes commandes » pour payer et lancer la vérification…`);
      setName(""); setFile(null);
      setTimeout(onCreated, 1200);
    } catch (err) { setError(errMsg(err)); }
  };

  return (
    <form className="panel" onSubmit={submit}>
      <h2>Nouvelle conversion</h2>
      <label>Nom de l'application<input value={name} onChange={(e) => setName(e.target.value)} minLength={2} required /></label>
      <label>Fichier Excel<input type="file" accept=".xlsx,.xlsm" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRunning(false); }} /></label>
      {file && (
        <div className="run-cta">
          <button type="button" className="primary" onClick={() => setRunning(true)}>▶ Exécuter</button>
          <span className="muted">Testez votre fichier dans le navigateur (formules et macros) avant de continuer.</span>
        </div>
      )}
      {running && file && <Runner file={file} onClose={() => setRunning(false)} />}
      <label>Numéro WhatsApp pour être notifié (facultatif)<input type="tel" placeholder="+243..." value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      <div className="plat-pick" role="group" aria-label="Plateformes">
        {pricing && Object.entries(pricing.platforms).map(([k, v]) => (
          <button type="button" key={k} aria-pressed={picked.includes(k)} className={`tile ${picked.includes(k) ? "on" : ""}`} style={{ ["--pc" as string]: PLATFORM_COLORS[k] }} onClick={() => toggle(k)}>
            <PlatformIcon id={k} size={30} />
            <strong>{LABELS[k] ?? k}</strong>
            <span>{v} $</span>
          </button>
        ))}
      </div>
      <p className="price">Estimation : {total} $</p>
      {error && <p className="error">{error}</p>}
      {msg && <p className="ok">{msg}</p>}
      <button className="primary" type="submit">Continuer la soumission</button>
    </form>
  );
}

function Claim() {
  const [key, setKey] = useState("");
  const [res, setRes] = useState<{ app_name: string; files: Delivery[] } | null>(null);
  const [error, setError] = useState("");

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setRes(null);
    try { setRes(await api.claim(key)); } catch (err) { setError(errMsg(err)); }
  };

  return (
    <section className="panel">
      <h2>Récupérer mon application</h2>
      <form onSubmit={verify} className="inline">
        <input placeholder="XXXX-XXXX-XXXX-XXXX" value={key} onChange={(e) => setKey(e.target.value)} required />
        <button className="primary" type="submit">Vérifier ma clé</button>
      </form>
      {error && <p className="error">{error}</p>}
      {res && (
        <div>
          <h3>{res.app_name}</h3>
          {res.files.map((d) => (
            <div className="row" key={d.id}>
              <span className="inline-ico"><PlatformIcon id={d.platform} size={18} /> {LABELS[d.platform] ?? d.platform} — {d.filename}</span>
              <button onClick={() => downloadDelivery(d, key).catch((e) => setError(errMsg(e)))}>Télécharger</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Admin() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const reload = () => api.adminOrders().then(setOrders).catch((e) => setError(errMsg(e)));
  useEffect(() => { reload(); }, []);

  const act = async (id: number, a: "start" | "ready") => {
    setError("");
    try { await api.adminAction(id, a); await reload(); } catch (e) { setError(errMsg(e)); }
  };
  const markPaid = async (id: number, purpose: "check" | "conversion") => {
    setError("");
    try { await api.adminMarkPaid(id, purpose); await reload(); } catch (e) { setError(errMsg(e)); }
  };
  const decide = async (paymentId: number, a: "confirm" | "reject") => {
    setError("");
    try { await api.adminPayment(paymentId, a); await reload(); } catch (e) { setError(errMsg(e)); }
  };
  const deliver = async (o: Order, platform: string, file: File | undefined) => {
    if (!file) return;
    setError("");
    try { await api.adminDeliver(o.id, platform, file); await reload(); } catch (e) { setError(errMsg(e)); }
  };

  return (
    <>
    <AdminMessages />
    <section className="panel">
      <h2>Administration des commandes</h2>
      {error && <p className="error">{error}</p>}
      {orders.map((o) => (
        <div className="card wide" key={o.id}>
          <strong>#{o.id} {o.app_name}</strong> · {o.user_email} · {o.total_usd} $ · {STATUS[o.status]} · {o.paid ? "payée" : "non payée"}
          {o.analysis && (
            <div className="muted">
              {o.analysis.sheet_count} feuille(s), {o.analysis.formula_count} formule(s){o.analysis.has_vba ? ", VBA" : ""}
            </div>
          )}
          {o.analysis?.warnings.map((w) => <div className="warn" key={w}>⚠ {w}</div>)}
          {o.payments.map((p) => (
            <div className="row" key={p.id}>
              <span>
                Paiement {PROVIDERS[p.provider] ?? p.provider} · {money(p.amount_cents)} · {PAY_STATUS[p.status]}
                {p.reference ? ` · réf. ${p.reference}` : ""}{p.phone ? ` · ${p.phone}` : ""}
              </span>
              {p.status === "pending" && p.provider !== "stripe" && (
                <span className="inline">
                  {p.has_proof && <button onClick={() => openProof(p.id).catch((e) => setError(errMsg(e)))}>Voir la capture</button>}
                  <button className="primary" onClick={() => decide(p.id, "confirm")}>Confirmer</button>
                  <button onClick={() => decide(p.id, "reject")}>Rejeter</button>
                </span>
              )}
            </div>
          ))}
          <div className="inline">
            <button onClick={() => downloadSource(o).catch((e) => setError(errMsg(e)))}>Télécharger le classeur</button>
            {!o.check_paid && <button onClick={() => markPaid(o.id, "check")}>Vérification payée (hors ligne)</button>}
            {o.check_paid && !o.paid && <button onClick={() => markPaid(o.id, "conversion")}>Conversion payée (hors ligne)</button>}
            {o.status === "report_ready" && <button onClick={() => act(o.id, "start")}>Démarrer la conversion</button>}
            {o.status === "in_progress" && <button className="primary" onClick={() => act(o.id, "ready")}>Marquer prête + clé</button>}
          </div>
          {o.status === "checking" && <ReportForm order={o} onDone={reload} />}
          {o.check_report && <ReportView report={o.check_report} />}
          {o.platforms.map((p) => {
            const d = o.deliveries.find((x) => x.platform === p);
            return (
              <div className="row" key={p}>
                <span className="inline-ico"><PlatformIcon id={p} size={18} /> {LABELS[p] ?? p} : {d ? d.filename : "livrable manquant"}</span>
                <input type="file" onChange={(e) => deliver(o, p, e.target.files?.[0])} />
              </div>
            );
          })}
          {o.claim_key && <div className="ok">Clé de récupération : <code>{o.claim_key}</code></div>}
        </div>
      ))}
    </section>
    </>
  );
}

function AdminMessages() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const load = () => api.adminConversations().then(setConvs).catch((e) => setError(errMsg(e)));
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  const key = (c: Conversation) => (c.user_id ? `u${c.user_id}` : `e${c.email}`);
  const total = convs.reduce((n, c) => n + c.unread, 0);

  const open = (c: Conversation) => {
    setOpenId(openId === key(c) ? null : key(c)); setText("");
    if (c.user_id && c.unread) api.adminMarkRead(c.user_id).then(load).catch(() => undefined);
  };
  const reply = async (c: Conversation) => {
    if (!c.user_id || !text.trim()) return;
    setError("");
    try { await api.adminReply(c.user_id, text.trim()); setText(""); await load(); } catch (e) { setError(errMsg(e)); }
  };

  return (
    <section className="panel">
      <h2>Messages des clients {total > 0 && <span className="badge-n">{total}</span>}</h2>
      {error && <p className="error">{error}</p>}
      {convs.length === 0 && <p className="muted">Aucun message pour le moment.</p>}
      {convs.map((c) => (
        <div className="conv" key={key(c)}>
          <button className="conv-head" onClick={() => open(c)}>
            <span><strong>{c.name ?? c.email}</strong>{c.name && <span className="muted"> · {c.email}</span>}</span>
            <span>{c.unread > 0 && <span className="badge-n">{c.unread}</span>} <span className="muted">{new Date(c.last_at).toLocaleString("fr-FR")}</span></span>
          </button>
          {openId === key(c) && (
            <div className="conv-body">
              <div className="bubbles">
                {c.messages.map((m) => <div key={m.id} className={`bubble ${m.from_admin ? "me" : "them"}`}>{m.body}<small>{new Date(m.created_at).toLocaleString("fr-FR")}</small></div>)}
              </div>
              {c.user_id ? (
                <form className="inline" onSubmit={(e) => { e.preventDefault(); reply(c); }}>
                  <input placeholder="Votre réponse…" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
                  <button className="primary" type="submit">Répondre</button>
                </form>
              ) : <p className="muted">Visiteur non connecté : répondez par e-mail à <a href={`mailto:${c.email}`}>{c.email}</a>.</p>}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
