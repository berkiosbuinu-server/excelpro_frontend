import { useCallback, useEffect, useState } from "react";
import { api, FALLBACK_TRANSFER_NUMBER, FALLBACK_WHATSAPP, hasToken, setToken, whatsappUrl, type Pricing } from "./api";
import { resetHostingSession, subApi, type Subscription } from "./hosting";
import type { Billing, Plan } from "./plans";
import { About } from "./About";
import { Login } from "./Auth";
import { ChatWidget, OPEN_CHAT_EVENT } from "./Chat";
import { Guide } from "./Guide";
import { Header, type Page } from "./Header";
import { Home } from "./Home";
import { Hosting } from "./Hosting";
import { NewOrder } from "./NewOrder";
import { Orders } from "./Orders";
import { Sites } from "./Sites";
import { Subscribe } from "./Subscribe";
import { Icon } from "./ui";
import { Logo } from "./visuals";

export default function App() {
  const [page, setPage] = useState<Page>(hasToken() ? "orders" : "home");
  const [email, setEmail] = useState<string | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [next, setNext] = useState<Page>("orders");
  const [register, setRegister] = useState(false);
  const [prefill, setPrefill] = useState<string[] | null>(null);
  const [payNotice, setPayNotice] = useState("");
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);
  // Abonnement d'hébergement : « Mon hébergement » n'existe que pour un compte qui a choisi une offre (essai, actif ou expiré).
  const [sub, setSub] = useState<Subscription | null | undefined>(undefined); // undefined = en cours de chargement
  const [choice, setChoice] = useState<{ plan: Plan; billing: Billing } | null>(null);
  const [wanted, setWanted] = useState<{ plan: Plan; billing: Billing } | null>(null);
  const loadSub = useCallback(() => { subApi.me().then(setSub).catch(() => setSub(null)); }, []);
  const hasPlan = !!sub && sub.access.state !== "none";

  useEffect(() => { api.pricing().then(setPricing).catch(() => undefined); }, []);
  useEffect(() => { if (email) { setSub(undefined); loadSub(); } else setSub(null); }, [email, loadSub]);
  useEffect(() => { if (email && wanted) { setChoice(wanted); setWanted(null); } }, [email, wanted]);
  useEffect(() => {
    if (!hasToken()) return;
    api.me().then((m) => setEmail(m.email)).catch(() => { setToken(null); setPage("home"); });
  }, []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("payment");
    if (q === "success") setPayNotice("Paiement reçu : votre commande est en cours de validation. Merci !");
    if (q === "cancelled") setPayNotice("Paiement annulé : aucun montant n'a été débité.");
    if (q) window.history.replaceState({}, "", window.location.pathname);
  }, []);
  useEffect(() => {
    if (page === "home" && pendingScroll) {
      // Laisse l'accueil se dessiner avant de défiler vers la section demandée.
      const t = window.setTimeout(() => { document.getElementById(pendingScroll)?.scrollIntoView({ behavior: "smooth", block: "start" }); setPendingScroll(null); }, 50);
      return () => window.clearTimeout(t);
    }
  }, [page, pendingScroll]);

  const go = (p: Page) => { setPage(p); window.scrollTo({ top: 0 }); };
  const onAuth = (token: string, _role: string, mail: string) => { setToken(token); setEmail(mail); go(next); setNext("orders"); };
  const logout = () => { resetHostingSession(); setSub(null); setToken(null); setEmail(null); go("home"); };
  const needLogin = (after: Page, signup = false) => { setNext(after); setRegister(signup); go("login"); };
  const start = (platforms?: string[]) => { setPrefill(platforms ?? null); if (email) go("submit"); else needLogin("submit", true); };
  const goSection = (id: string) => { setPendingScroll(id); if (page === "home") { document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); setPendingScroll(null); } else go("home"); };
  // « Mon hébergement » : seulement avec une offre ; sinon on renvoie vers les tarifs pour en choisir une.
  const chooseHosting = () => { if (email && hasPlan) go("hosting"); else goSection("hebergement"); };
  const choosePlan = (plan: Plan, billing: Billing) => { if (email) setChoice({ plan, billing }); else { setWanted({ plan, billing }); needLogin("home", true); } };
  const wa = pricing?.whatsapp_contact || FALLBACK_WHATSAPP;
  const gate = (node: JSX.Element) => (email ? node : <Login onAuth={onAuth} startRegister={register} />);

  return (
    <>
      <Header
        page={page} email={email} hasPlan={hasPlan} whatsappHref={whatsappUrl(wa, "Bonjour ExcelPro, j'ai une question.")}
        go={go} goSection={goSection} onStart={() => start()} onLogin={() => needLogin("orders")} onLogout={logout}
        onChat={() => window.dispatchEvent(new Event(OPEN_CHAT_EVENT))}
      />
      {payNotice && <div className="notice" role="status"><span>{payNotice}</span><button type="button" onClick={() => setPayNotice("")} aria-label="Fermer"><Icon name="x" size={18} /></button></div>}
      <main className={page === "home" ? "wide-main" : page === "guide" || page === "about" ? "" : "app-main"}>
        {page === "home" && <Home pricing={pricing} onStart={start} onHost={choosePlan} goSection={goSection} />}
        {page === "guide" && <Guide />}
        {page === "about" && <About onStart={() => start()} onHosting={chooseHosting} />}
        {page === "login" && <Login onAuth={onAuth} startRegister={register} />}
        {page === "submit" && gate(<NewOrder pricing={pricing} initialPlatforms={prefill} onCreated={() => go("orders")} />)}
        {page === "orders" && gate(<Orders pricing={pricing} onNew={() => start()} />)}
        {page === "hosting" && gate(
          sub === undefined ? <p className="muted center pad">Chargement…</p> : hasPlan ? <Hosting onPlans={() => goSection("hebergement")} /> : (
            <section className="hosting-shell"><div className="hosting-empty"><div className="hosting-symbol">▤</div><h2>Choisissez une offre d'hébergement</h2><p>L'hébergement est réservé aux comptes qui ont une offre. Choisissez-en une, payez par mobile money : elle est activée dès que nous avons vérifié le paiement.</p><button type="button" className="primary" onClick={() => goSection("hebergement")}>Voir les offres</button></div></section>
          ),
        )}
        {page === "sites" && gate(<Sites transferNumber={pricing?.transfer_number || FALLBACK_TRANSFER_NUMBER} />)}
      </main>
      <ChatWidget pricing={pricing} email={email} />
      {choice && <Subscribe plan={choice.plan} billing={choice.billing} pricing={pricing} onClose={() => setChoice(null)} onChanged={loadSub} onOpenHosting={() => { setChoice(null); setSub(undefined); loadSub(); go("hosting"); }} />}
      <footer className="footer">
        <div className="footer-in">
          <div className="foot-brand"><button type="button" className="brand" onClick={() => go("home")}><Logo size={28} /><span>ExcelPro</span></button><p className="muted">Votre Excel devient une application.</p></div>
          <nav className="foot-col" aria-label="Produit"><b>Produit</b><button type="button" onClick={() => start()}>Soumettre un classeur</button><button type="button" onClick={() => goSection("tarifs")}>Tarifs</button><button type="button" onClick={() => goSection("hebergement")}>Hébergement</button><button type="button" onClick={() => (email ? go("sites") : goSection("sites-tarifs"))}>Sites web</button></nav>
          <nav className="foot-col" aria-label="Ressources"><b>Ressources</b><button type="button" onClick={() => go("guide")}>Guide d'utilisation</button><button type="button" onClick={() => go("about")}>Qui sommes-nous ?</button></nav>
          <nav className="foot-col" aria-label="Contact"><b>Contact</b><button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_CHAT_EVENT))}>Nous écrire</button><a href={whatsappUrl(wa, "Bonjour ExcelPro, j'ai une question.")} target="_blank" rel="noopener noreferrer">WhatsApp</a></nav>
        </div>
      </footer>
    </>
  );
}
