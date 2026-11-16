import { useEffect, useRef, useState } from "react";
import { api, FALLBACK_WHATSAPP, whatsappUrl, type Message, type Pricing } from "./api";

const WA_ICON = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.05-1.32A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3 .78.8-2.92-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.25-.12-1.46-.72-1.69-.8-.22-.08-.39-.12-.55.12-.17.25-.64.8-.78.97-.14.16-.29.18-.53.06a6.7 6.7 0 0 1-3.3-2.88c-.25-.43.25-.4.71-1.32.08-.16.04-.3-.02-.42-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.66.31c-.22.25-.86.84-.86 2.05s.88 2.38 1 2.55c.12.16 1.73 2.64 4.2 3.7 1.57.68 2.18.74 2.97.62.48-.07 1.46-.6 1.67-1.17.2-.58.2-1.07.14-1.17-.06-.1-.22-.16-.47-.28z" />
  </svg>
);

export function ChatWidget({ pricing, email, isAdmin, onAdmin }: { pricing: Pricing | null; email: string | null; isAdmin: boolean; onAdmin: () => void }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const wa = pricing?.whatsapp_contact || FALLBACK_WHATSAPP;

  useEffect(() => {
    if (!email || isAdmin) { setUnread(0); return; }
    const load = () => api.unread().then((r) => setUnread(r.count)).catch(() => undefined);
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [email, isAdmin, open]);

  return (
    <>
      <div className="fabs">
        <a className="fab wa" href={whatsappUrl(wa, "Bonjour ExcelPro, j'ai une question.")} target="_blank" rel="noopener noreferrer" aria-label="Nous écrire sur WhatsApp">
          {WA_ICON}<span>WhatsApp</span>
        </a>
        <button className="fab chat" onClick={() => (isAdmin ? onAdmin() : setOpen(true))} aria-label="Nous écrire">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
          <span>Nous écrire</span>
          {unread > 0 && <b className="badge-n">{unread}</b>}
        </button>
      </div>
      {open && <ChatModal email={email} wa={wa} onClose={() => setOpen(false)} />}
    </>
  );
}

function ChatModal({ email, wa, onClose }: { email: string | null; wa: string; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [mail, setMail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  useEffect(() => {
    if (!email) return;
    const load = () => api.messages().then(setMsgs).catch(() => undefined);
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [email]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setError(""); setBusy(true);
    try {
      if (email) {
        const m = await api.sendMessage(body);
        setMsgs((cur) => [...cur, m]);
      } else {
        await api.contact(name, mail, body);
        setSent(true);
      }
      setText("");
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur"); }
    setBusy(false);
  };

  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal chat" role="dialog" aria-modal="true" aria-labelledby="chat-title">
        <button className="close" onClick={onClose} aria-label="Fermer">✕</button>
        <h2 id="chat-title">Nous écrire</h2>
        <p className="muted chat-sub">{email ? "Nous vous répondons ici dès que possible. Vos messages sont conservés." : "Laissez-nous un message, nous vous répondons par e-mail."}</p>

        {email ? (
          <div className="bubbles chat-log" aria-live="polite">
            {msgs.length === 0 && <p className="muted center">Écrivez votre premier message ci-dessous.</p>}
            {msgs.map((m) => (
              <div key={m.id} className={`bubble ${m.from_admin ? "them" : "me"}`}>{m.body}<small>{new Date(m.created_at).toLocaleString("fr-FR")}</small></div>
            ))}
            <div ref={end} />
          </div>
        ) : sent ? (
          <div className="pane success"><div className="check-big">✓</div><h3>Message envoyé</h3><p>Merci ! Nous vous répondrons par e-mail.</p></div>
        ) : null}

        {!(sent && !email) && (
          <form onSubmit={send} className="chat-form">
            {!email && (
              <div className="two">
                <label>Nom<input value={name} onChange={(e) => setName(e.target.value)} minLength={2} required /></label>
                <label>E-mail<input type="email" value={mail} onChange={(e) => setMail(e.target.value)} required /></label>
              </div>
            )}
            <div className="inline send-row">
              <textarea rows={email ? 2 : 4} placeholder="Votre message…" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} required
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && email) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
              <button className="primary" type="submit" disabled={busy}>Envoyer</button>
            </div>
          </form>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <a className="wa-link" href={whatsappUrl(wa, "Bonjour ExcelPro, j'ai une question.")} target="_blank" rel="noopener noreferrer">{WA_ICON}<span>Préférez-vous WhatsApp ? Écrivez-nous directement</span></a>
      </div>
    </div>
  );
}
