import { useEffect, useState } from "react";
import { FALLBACK_TRANSFER_NUMBER, type Pricing } from "./api";
import { subApi, type Subscription } from "./hosting";
import { BILLING_LABEL, BILLING_MONTHS, fmtUsd, priceFor, type Billing, type Plan } from "./plans";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erreur inconnue");

/** Choix d'une offre : essai gratuit (une fois) ou demande d'abonnement payant (validée après réception du paiement). */
export function Subscribe({ plan, billing, pricing, onClose, onChanged, onOpenHosting }: {
  plan: Plan; billing: Billing; pricing: Pricing | null; onClose: () => void; onChanged: () => void; onOpenHosting?: () => void;
}) {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [b, setB] = useState<Billing>(billing);
  const [ref, setRef] = useState(""); const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [done, setDone] = useState("");
  const transfer = pricing?.transfer_number || FALLBACK_TRANSFER_NUMBER;
  useEffect(() => { subApi.me().then(setSub).catch((e) => setError(errMsg(e))); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  const amount = priceFor(plan.monthly, b);
  const state = sub?.access.state ?? "none";

  const send = async () => {
    if (ref.trim().length < 3) { setError("Indiquez la référence de votre transaction (reçue par SMS ou sur le reçu)."); return; }
    setBusy(true); setError("");
    try { await subApi.request({ plan: plan.id, billing: b, reference: ref.trim(), phone: phone.trim() || undefined }); setDone("Demande envoyée. Votre offre sera activée dès que nous aurons vérifié le paiement (en général sous 24 h)."); onChanged(); }
    catch (e) { setError(errMsg(e)); }
    setBusy(false);
  };

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sub-title" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Fermer">✕</button>
        <h2 id="sub-title">Offre {plan.name}</h2>
        {!sub && !error && <p className="muted">Chargement…</p>}
              {sub && state === "active" && <p className="notice-inline">Offre « {sub.plan} » active{sub.access.expiresAt ? ` jusqu'au ${sub.access.expiresAt.slice(0, 10)}` : ""}. Le paiement ci-dessous la prolonge (ou la remplace).</p>}
        {sub && state === "expired" && <p className="error">Votre offre a expiré. Renouvelez-la pour importer et modifier vos données.</p>}
        {sub?.pending && !done && <p className="warn">Une demande est déjà en attente de vérification ({sub.pending.plan}, {fmtUsd(sub.pending.amountCents / 100)}). Une nouvelle demande la remplacera.</p>}
        {done ? <p className="ok-msg" role="status">{done}</p> : sub && (
          <>
            <h3 style={{ marginTop: 14 }}>Souscrire</h3>
            <div className="billing" role="group" aria-label="Période">
              {(["monthly", "quarterly", "yearly"] as Billing[]).map((x) => <button key={x} className={b === x ? "on" : ""} onClick={() => setB(x)}>{BILLING_LABEL[x]}</button>)}
            </div>
            <p><b style={{ fontSize: "1.4rem" }}>{fmtUsd(amount)}</b> <span className="muted">pour {BILLING_MONTHS[b]} mois de service{b === "quarterly" ? " (1 mois offert)" : b === "yearly" ? " (−30 %)" : ""}</span></p>
            <ol className="muted" style={{ paddingLeft: 18 }}>
              <li>Envoyez <b>{fmtUsd(amount)}</b> par mobile money (M-PESA, Orange Money, Airtel Money) au <b>{transfer}</b>.</li>
              <li>Saisissez ci-dessous la référence de la transaction.</li>
              <li>Nous vérifions le paiement puis activons votre offre.</li>
            </ol>
            <label>Référence de la transaction<input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ex. MP2611…" /></label>
            <label>Numéro d'envoi (facultatif)<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></label>
            <button className="primary" disabled={busy} onClick={() => void send()}>{busy ? "Envoi…" : "J'ai payé : envoyer ma demande"}</button>
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
