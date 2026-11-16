import { useEffect, useState } from "react";
import { api, FALLBACK_TRANSFER_NUMBER, money, type Order, type Pricing } from "./api";
import { CardIcon, OPERATOR_STYLE, PhoneIcon } from "./visuals";

type Method = "card" | "mobile" | "transfer";

export function PayModal({ order, purpose, amount, pricing, onClose, onDone }: {
  order: Order; purpose: "check" | "conversion"; amount: number; pricing: Pricing | null; onClose: () => void; onDone: () => void;
}) {
  const methods = pricing?.payment_methods;
  const mobile = methods?.mobile_money ?? [];
  const hasCard = !!methods?.stripe;
  const [method, setMethod] = useState<Method>(hasCard ? "card" : mobile.length > 0 ? "mobile" : "transfer");
  const transferNumber = pricing?.transfer_number || FALLBACK_TRANSFER_NUMBER;
  const [proof, setProof] = useState<File | null>(null);
  const [tPhone, setTPhone] = useState("");
  const [tRef, setTRef] = useState("");
  const [copied, setCopied] = useState(false);
  const pendingTransfer = order.payments.some((p) => p.status === "pending" && p.provider === "transfer" && p.purpose === purpose);
  const [operator, setOperator] = useState(mobile[0]?.id ?? "");
  const [phone, setPhone] = useState("");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const pending = order.payments.some((p) => p.status === "pending" && p.provider !== "stripe" && p.purpose === purpose);
  const op = mobile.find((m) => m.id === operator);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const card = async () => {
    setError(""); setBusy(true);
    try { window.location.href = (await api.payStripe(order.id)).url; }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); setBusy(false); }
  };
  const submitMobile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const r = await api.payMobileMoney(order.id, operator, phone, ref);
      setInfo(r.instructions);
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur"); }
    setBusy(false);
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(transferNumber.replace(/\s/g, "")); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* presse-papiers indisponible */ }
  };
  const submitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!proof) return setError("Ajoutez la capture de votre transaction");
    if (proof.size > 8 * 1024 * 1024) return setError("La capture est trop volumineuse (8 Mo max)");
    setBusy(true);
    try {
      const f = new FormData();
      f.append("proof", proof);
      f.append("phone", tPhone);
      f.append("transaction_ref", tRef);
      await api.payTransfer(order.id, f);
      setInfo("Capture reçue. Nous vérifions votre transaction et validons votre commande dès que possible : vous serez notifié.");
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur"); }
    setBusy(false);
  };

  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pay-title">
        <button className="close" onClick={onClose} aria-label="Fermer">✕</button>
        <div className="pay-head">
          <div className="muted">{purpose === "check" ? "Frais de vérification" : "Conversion de l'application"} · {order.app_name}</div>
          <h2 id="pay-title">{money(amount)}</h2>
        </div>

        {!info && (
          <>
            <div className="tabs" role="tablist">
              {hasCard && (
                <button role="tab" aria-selected={method === "card"} className={method === "card" ? "on" : ""} onClick={() => setMethod("card")}>
                  <CardIcon /> <span>Carte bancaire</span>
                </button>
              )}
              <button role="tab" aria-selected={method === "transfer"} className={method === "transfer" ? "on" : ""} onClick={() => setMethod("transfer")}>
                <PhoneIcon /> <span>Transfert</span>
              </button>
              {mobile.length > 0 && (
                <button role="tab" aria-selected={method === "mobile"} className={method === "mobile" ? "on" : ""} onClick={() => setMethod("mobile")}>
                  <PhoneIcon /> <span>Mobile Money (auto)</span>
                </button>
              )}
            </div>

            {method === "transfer" && (
              pendingTransfer ? (
                <div className="pane"><p className="muted">Votre capture est déjà en cours de vérification pour cette commande. Vous serez notifié dès la validation.</p></div>
              ) : (
                <form className="pane" onSubmit={submitTransfer}>
                  <div className="xfer">
                    <span className="muted">Envoyez {money(amount)} par mobile money au</span>
                    <strong className="xfer-num">{transferNumber}</strong>
                    <button type="button" onClick={copy}>{copied ? "Copié ✓" : "Copier le numéro"}</button>
                  </div>
                  <ol className="steps">
                    <li>Faites le transfert de <strong>{money(amount)}</strong> (ou l'équivalent en monnaie locale) depuis M-PESA, Orange Money, Airtel Money…</li>
                    <li>Faites une <strong>capture d'écran</strong> de la transaction (montant, numéro et identifiant visibles).</li>
                    <li>Envoyez-la ci-dessous : nous la contrôlons puis validons votre commande.</li>
                  </ol>
                  <label>Capture de la transaction (image ou PDF)
                    <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => setProof(e.target.files?.[0] ?? null)} required />
                  </label>
                  <label>Votre numéro d'envoi (facultatif)<input type="tel" inputMode="tel" placeholder="+243 8x xxx xxxx" value={tPhone} onChange={(e) => setTPhone(e.target.value)} /></label>
                  <label>Identifiant de transaction (facultatif)<input placeholder="Ex. MP2411ABC1" value={tRef} onChange={(e) => setTRef(e.target.value)} autoCapitalize="characters" /></label>
                  <button className="primary big full" type="submit" disabled={busy}>{busy ? "Envoi…" : "Envoyer ma capture pour validation"}</button>
                </form>
              )
            )}

            {method === "card" && hasCard && (
              <div className="pane">
                <p>Paiement sécurisé par <strong>Stripe</strong> (Visa, Mastercard, American Express). Vous serez redirigé vers la page de paiement de Stripe : vos coordonnées bancaires ne transitent jamais par notre site.</p>
                <button className="primary big full" onClick={card} disabled={busy}>{busy ? "Redirection…" : `Payer ${money(amount)} par carte`}</button>
              </div>
            )}

            {method === "mobile" && mobile.length > 0 && (
              pending ? (
                <div className="pane"><p className="muted">Un paiement mobile money est déjà en cours de vérification pour cette commande. Vous serez notifié dès sa confirmation.</p></div>
              ) : (
                <form className="pane" onSubmit={submitMobile}>
                  <div className="ops" role="radiogroup" aria-label="Opérateur">
                    {mobile.map((m) => {
                      const st = OPERATOR_STYLE[m.id];
                      return (
                        <button type="button" key={m.id} role="radio" aria-checked={operator === m.id} className={`op ${operator === m.id ? "on" : ""}`} onClick={() => setOperator(m.id)}>
                          <span className="dot" style={{ background: st?.bg ?? "#667085", color: st?.fg ?? "#fff" }}>{m.label.charAt(0)}</span>
                          <span>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <ol className="steps">
                    <li>Envoyez <strong>{money(amount)}</strong> (ou l'équivalent en monnaie locale) via <strong>{op?.label}</strong> au numéro <strong className="num">{op?.number ?? "indiqué après validation"}</strong>.</li>
                    <li>Notez l'identifiant de transaction reçu par SMS.</li>
                    <li>Renseignez-le ci-dessous : votre commande est validée après vérification.</li>
                  </ol>
                  <label>Votre numéro mobile money<input type="tel" inputMode="tel" placeholder="+243 8x xxx xxxx" value={phone} onChange={(e) => setPhone(e.target.value)} required /></label>
                  <label>Identifiant de transaction (SMS)<input placeholder="Ex. MP2411ABC1" value={ref} onChange={(e) => setRef(e.target.value)} required autoCapitalize="characters" /></label>
                  <button className="primary big full" type="submit" disabled={busy}>{busy ? "Envoi…" : `Confirmer mon paiement de ${money(amount)}`}</button>
                </form>
              )
            )}
          </>
        )}

        {info && (
          <div className="pane success">
            <div className="check-big">✓</div>
            <h3>Paiement envoyé</h3>
            <p>{info}</p>
            <button className="primary full" onClick={onClose}>Terminé</button>
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <p className="secure">🔒 Transactions chiffrées · Aucune donnée bancaire n'est conservée</p>
      </div>
    </div>
  );
}
