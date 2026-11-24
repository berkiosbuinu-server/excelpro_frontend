import { useCallback, useEffect, useMemo, useState } from "react";
import { api, downloadDelivery, money, type CheckReport, type Delivery, type Order, type Pricing } from "./api";
import { PayModal } from "./PayModal";
import { CATEGORIES, ITEM_ICON, ITEM_STATUS, LABELS, PAY_STATUS, PROVIDERS, STATUS, STEPS, STEP_SHORT, VERDICTS, errMsg, purposeOf } from "./labels";
import { Drawer, Icon } from "./ui";
import { PlatformBadge, PlatformIcon } from "./visuals";

type Filter = "all" | "pay" | "progress" | "ready";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Toutes" }, { id: "pay", label: "À payer" }, { id: "progress", label: "En cours" }, { id: "ready", label: "Prêtes" },
];
const kindOf = (o: Order): Filter => (purposeOf(o) ? "pay" : o.status === "ready" ? "ready" : "progress");

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** « Mes commandes » : toutes les conversions au même endroit, avec le Studio pour récupérer les applications terminées. */
export function Orders({ pricing, onNew }: { pricing: Pricing | null; onNew: () => void }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [studio, setStudio] = useState(false);
  const [error, setError] = useState("");
  const reload = useCallback(() => api.myOrders().then((o) => { setOrders(o); setError(""); }).catch((e) => setError(errMsg(e))), []);
  useEffect(() => { void reload(); }, [reload]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, pay: 0, progress: 0, ready: 0 };
    for (const o of orders ?? []) { c.all++; c[kindOf(o)]++; }
    return c;
  }, [orders]);
  const shown = (orders ?? []).filter((o) => filter === "all" || kindOf(o) === filter);

  return (
    <section className="page">
      <div className="page-head">
        <div className="page-title"><h1>Mes commandes</h1><p className="muted">Suivez vos conversions et récupérez vos applications.</p></div>
        <div className="page-actions">
          <button type="button" onClick={() => setStudio(true)}><Icon name="key" size={18} />Studio{counts.ready > 0 && <span className="badge-n" aria-label={`${counts.ready} prête(s)`}>{counts.ready}</span>}</button>
          <button type="button" className="primary" onClick={onNew}><Icon name="plus" size={18} />Nouvelle conversion</button>
        </div>
      </div>

      <div className="stat-row" role="group" aria-label="Filtrer les commandes">
        {FILTERS.map((f) => (
          <button type="button" key={f.id} className={`stat-card${filter === f.id ? " on" : ""} k-${f.id}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            <strong>{counts[f.id]}</strong><span>{f.label}</span>
          </button>
        ))}
      </div>

      {error && <p className="alert err" role="alert"><Icon name="alert" size={18} />{error}</p>}
      {orders === null && !error && <div className="orders">{[0, 1].map((i) => <div key={i} className="skeleton order-sk" />)}</div>}
      {orders !== null && orders.length === 0 && (
        <div className="empty">
          <span className="empty-ico"><Icon name="package" size={28} /></span>
          <h2>Aucune commande pour le moment</h2>
          <p className="muted">Envoyez votre premier classeur Excel : vous recevez un rapport de vérification avant de payer la conversion.</p>
          <button type="button" className="primary" onClick={onNew}><Icon name="upload" size={18} />Soumettre un classeur</button>
        </div>
      )}
      {orders !== null && orders.length > 0 && shown.length === 0 && <p className="muted center pad">Aucune commande dans cette catégorie.</p>}
      <div className="orders">{shown.map((o) => <OrderCard key={o.id} order={o} pricing={pricing} onDone={reload} onStudio={() => setStudio(true)} />)}</div>

      {studio && <Studio readyCount={counts.ready} onClose={() => setStudio(false)} />}
    </section>
  );
}

function OrderCard({ order: o, pricing, onDone, onStudio }: { order: Order; pricing: Pricing | null; onDone: () => void; onStudio: () => void }) {
  const [pay, setPay] = useState(false);
  const purpose = purposeOf(o);
  const [details, setDetails] = useState(o.status === "report_ready");
  const step = STEPS.indexOf(o.status);
  const amount = purpose === "check" ? o.check_fee_cents : o.total_usd * 100;
  const hint =
    purpose === "check" ? "Réglez les frais de vérification : nos experts testeront ensuite votre fichier."
    : purpose === "conversion" ? "Le rapport est prêt. Payez la conversion pour la démarrer."
    : o.status === "checking" ? "Nos experts testent votre fichier. Le rapport apparaîtra ici."
    : o.status === "in_progress" ? "Votre application est en cours de conversion."
    : o.status === "ready" ? "Votre application est prête : ouvrez le Studio et saisissez votre clé de récupération."
    : null;

  return (
    <article className={`order st-${o.status}`}>
      <header className="order-top">
        <div className="order-title"><h3>{o.app_name}</h3><p className="muted">{o.original_filename} · {fmtDate(o.created_at)}</p></div>
        <span className={`status s-${o.status}`}>{STATUS[o.status]}</span>
      </header>
      <div className="chips">{o.platforms.map((p) => <PlatformBadge key={p} id={p} label={LABELS[p] ?? p} />)}</div>

      <ol className="stepper" aria-label="Avancement">
        {STEP_SHORT.map((t, i) => {
          const done = o.status === "ready" || i < step;
          return <li key={t} className={done ? "done" : i === step ? "cur" : ""} aria-current={i === step && o.status !== "ready" ? "step" : undefined}><span className="dot">{done ? <Icon name="check" size={14} /> : i + 1}</span><span className="lab">{t}</span></li>;
        })}
      </ol>

      {o.analysis?.warnings.map((w) => <p className="alert warn" key={w}><Icon name="alert" size={18} />{w}</p>)}
      {purposeOf(o) === null && o.check_report?.verdict === "not_convertible" && !o.paid && (
        <p className="alert warn"><Icon name="alert" size={18} />Ce fichier n'est pas convertible en l'état : contactez-nous pour étudier les adaptations possibles.</p>
      )}

      {(purpose || o.status === "ready" || hint) && (
        <div className={`order-next${purpose ? " pay" : o.status === "ready" ? " ready" : ""}`}>
          <div>
            {purpose && <strong>{purpose === "check" ? "Frais de vérification" : "Conversion"} : {money(amount)}</strong>}
            {hint && <p className={purpose ? "muted" : ""}>{hint}</p>}
          </div>
          {purpose && <button type="button" className="primary big" onClick={() => setPay(true)}>Payer {money(amount)}</button>}
          {o.status === "ready" && <button type="button" className="primary big" onClick={onStudio}><Icon name="key" size={18} />Ouvrir le Studio</button>}
        </div>
      )}

      <button type="button" className="more-toggle" aria-expanded={details} onClick={() => setDetails(!details)}>
        {details ? "Masquer les détails" : "Détails, paiements et rapport"}<Icon name="down" size={16} className={details ? "flip" : ""} />
      </button>
      {details && (
        <div className="order-details">
          <div className="amounts">
            <div><span className="muted">Vérification</span><strong>{money(o.check_fee_cents)}</strong><span className={o.check_paid ? "ok" : "warn-t"}>{o.check_paid ? "payée" : "à payer"}</span></div>
            <div><span className="muted">Conversion</span><strong>{o.total_usd} $</strong><span className={o.paid ? "ok" : "warn-t"}>{o.paid ? "payée" : "non payée"}</span></div>
          </div>
          {o.payments.map((p) => (
            <p className="muted pay-line" key={p.id}>{p.purpose === "check" ? "Vérification" : "Conversion"} — {PROVIDERS[p.provider] ?? p.provider} : {PAY_STATUS[p.status]}{p.reference ? ` (${p.reference})` : ""}</p>
          ))}
          {o.check_report && <ReportView report={o.check_report} />}
        </div>
      )}
      {pay && purpose && <PayModal order={o} purpose={purpose} amount={amount} pricing={pricing} onClose={() => setPay(false)} onDone={onDone} />}
    </article>
  );
}

function ReportView({ report }: { report: CheckReport }) {
  return (
    <div className="report">
      <h4>Rapport de vérification <span className={`verdict v-${report.verdict}`}>{VERDICTS[report.verdict]}</span></h4>
      {report.tested_on && <p className="muted">Testé sur : {report.tested_on}</p>}
      <p>{report.summary}</p>
      <div className="stats">
        {report.statistics.filter((s) => s.value > 0).map((s) => <span key={s.label} className="chip">{s.label} : <strong>{s.value}</strong></span>)}
      </div>
      {Object.entries(CATEGORIES).map(([cat, label]) => {
        const items = report.items.filter((i) => i.category === cat);
        return items.length === 0 ? null : (
          <div key={cat}>
            <h5>{label}</h5>
            {items.map((i, k) => (
              <div key={k} className={`item ${i.status}`}>
                <span>{ITEM_ICON[i.status]} <strong>{i.name}</strong> — {ITEM_STATUS[i.status]}</span>
                {i.details && <div className="muted">{i.details}</div>}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Studio : on saisit la clé de récupération reçue, on télécharge les livrables de chaque plateforme. */
function Studio({ readyCount, onClose }: { readyCount: number; onClose: () => void }) {
  const [key, setKey] = useState("");
  const [res, setRes] = useState<{ app_name: string; files: Delivery[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setRes(null); setBusy(true);
    try { setRes(await api.claim(key)); } catch (err) { setError(errMsg(err)); }
    setBusy(false);
  };
  // Saisie guidée : majuscules et tirets tous les 4 caractères (XXXX-XXXX-XXXX-XXXX).
  const format = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16).replace(/(.{4})(?=.)/g, "$1-");

  return (
    <Drawer title="Studio" subtitle="Récupérez vos applications converties" onClose={onClose}>
      {readyCount > 0 && <p className="alert ok-a"><Icon name="check" size={18} />{readyCount === 1 ? "Une de vos commandes est prête." : `${readyCount} de vos commandes sont prêtes.`} Saisissez votre clé de récupération.</p>}
      <form onSubmit={verify}>
        <label>Clé de récupération
          <input value={key} onChange={(e) => setKey(format(e.target.value))} placeholder="XXXX-XXXX-XXXX-XXXX" autoFocus autoComplete="off" spellCheck={false} required className="mono" />
        </label>
        <button className="primary full" type="submit" disabled={busy || key.length < 4}>{busy ? "Vérification…" : "Vérifier ma clé"}</button>
      </form>
      {error && <p className="alert err" role="alert"><Icon name="alert" size={18} />{error}</p>}
      {res && (
        <div className="deliv">
          <h3>{res.app_name}</h3>
          <ul>
            {res.files.map((d) => (
              <li key={d.id}>
                <span className="deliv-ico"><PlatformIcon id={d.platform} size={22} /></span>
                <div><b>{LABELS[d.platform] ?? d.platform}</b><small>{d.filename}</small></div>
                <button type="button" onClick={() => downloadDelivery(d, key).catch((e) => setError(errMsg(e)))}><Icon name="download" size={16} />Télécharger</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!res && !error && <p className="muted">La clé vous est remise quand votre commande est prête. Elle donne accès aux livrables de chaque plateforme commandée.</p>}
    </Drawer>
  );
}
