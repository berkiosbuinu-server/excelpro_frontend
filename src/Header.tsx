import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Logo } from "./visuals";
import { Icon, useEscape, useOutside, useScrollLock, type IconName } from "./ui";
import { applyTheme, getTheme, type ThemePref } from "./theme";

export type Page = "home" | "about" | "guide" | "login" | "submit" | "orders" | "hosting" | "sites";

type Entry = { icon: IconName; label: string; hint?: string; run: () => void; current?: boolean };

type Props = {
  page: Page; email: string | null; hasPlan: boolean; whatsappHref: string;
  go: (p: Page) => void; goSection: (id: string) => void; onStart: () => void; onLogin: () => void; onLogout: () => void; onChat: () => void;
};

const THEMES: { id: ThemePref; label: string; icon: IconName }[] = [
  { id: "auto", label: "Auto", icon: "monitor" }, { id: "light", label: "Clair", icon: "sun" }, { id: "dark", label: "Sombre", icon: "moon" },
];

function ThemeSwitch() {
  const [t, setT] = useState<ThemePref>(getTheme);
  return (
    <div className="seg" role="group" aria-label="Apparence">
      {THEMES.map((x) => (
        <button key={x.id} type="button" aria-pressed={t === x.id} className={t === x.id ? "on" : ""} onClick={() => { setT(x.id); applyTheme(x.id); }}>
          <Icon name={x.icon} size={15} />{x.label}
        </button>
      ))}
    </div>
  );
}

/** Menu déroulant : s'ouvre au clic, se ferme avec Échap, un clic à l'extérieur ou le choix d'une entrée. */
function Dropdown({ trigger, children, align = "right", label }: { trigger: (open: boolean) => ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right"; label: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useEscape(close, open);
  const ref = useOutside<HTMLDivElement>(close, open);
  return (
    <div className="dd" ref={ref}>
      <button type="button" className="dd-trigger" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen(!open)}>{trigger(open)}</button>
      {open && <div className={`dd-menu ${align}`} role="menu">{children(close)}</div>}
    </div>
  );
}

function MenuItem({ e, close }: { e: Entry; close: () => void }) {
  return (
    <button type="button" role="menuitem" className={`dd-item${e.current ? " current" : ""}`} onClick={() => { close(); e.run(); }}>
      <span className="dd-ico"><Icon name={e.icon} size={18} /></span>
      <span className="dd-txt"><b>{e.label}</b>{e.hint && <small>{e.hint}</small>}</span>
    </button>
  );
}

export function Header({ page, email, hasPlan, whatsappHref, go, goSection, onStart, onLogin, onLogout, onChat }: Props) {
  const [drawer, setDrawer] = useState(false);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  useEscape(closeDrawer, drawer); useScrollLock(drawer);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1000px)");
    const h = () => { if (mq.matches) setDrawer(false); };
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  const wa = () => { window.open(whatsappHref, "_blank", "noopener,noreferrer"); };
  const main: Entry[] = email
    ? [
        { icon: "package", label: "Mes commandes", run: () => go("orders"), current: page === "orders" },
        ...(hasPlan ? [{ icon: "server" as IconName, label: "Mon hébergement", run: () => go("hosting"), current: page === "hosting" }] : []),
        { icon: "globe", label: "Mes sites", run: () => go("sites"), current: page === "sites" },
        { icon: "book", label: "Guide", run: () => go("guide"), current: page === "guide" },
      ]
    : [
        { icon: "tag", label: "Tarifs", run: () => goSection("tarifs") },
        { icon: "server", label: "Hébergement", run: () => goSection("hebergement") },
        { icon: "book", label: "Guide", run: () => go("guide"), current: page === "guide" },
      ];
  const more: Entry[] = [
    { icon: "home", label: "Accueil", hint: "Présentation d'ExcelPro", run: () => go("home"), current: page === "home" },
    { icon: "upload", label: "Soumettre un classeur", hint: "Convertir un fichier Excel", run: onStart },
    ...(email ? [
      { icon: "tag" as IconName, label: "Tarifs des applications", hint: "Prix par plateforme", run: () => goSection("tarifs") },
      { icon: "server" as IconName, label: "Offres d'hébergement", hint: "Données, API et sites web", run: () => goSection("hebergement") },
      { icon: "globe" as IconName, label: "Tarifs des sites web", hint: "Starter et Pro", run: () => goSection("sites-tarifs") },
    ] : [
      { icon: "globe" as IconName, label: "Sites web", hint: "Publier un site en ligne", run: () => goSection("sites-tarifs") },
    ]),
    { icon: "info", label: "Qui sommes-nous ?", hint: "Notre histoire et notre vision", run: () => go("about"), current: page === "about" },
    { icon: "chat", label: "Nous écrire", hint: "Une question ? Écrivez-nous ici", run: onChat },
    { icon: "phone", label: "WhatsApp", hint: "Discuter avec l'équipe", run: wa },
  ];
  const initial = (email ?? "?").charAt(0).toUpperCase();

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <button type="button" className="brand" onClick={() => go("home")} aria-label="ExcelPro, accueil"><Logo size={32} /><span>ExcelPro</span></button>

          <nav className="main-nav" aria-label="Navigation principale">
            {main.map((e) => (
              <button type="button" key={e.label} className={`nav-link${e.current ? " active" : ""}`} aria-current={e.current ? "page" : undefined} onClick={e.run}>
                <Icon name={e.icon} size={18} /><span>{e.label}</span>
              </button>
            ))}
            <Dropdown label="Plus d'options" align="left" trigger={(o) => <><span>Plus</span><Icon name="down" size={16} className={o ? "flip" : ""} /></>}>
              {(close) => (
                <>
                  <div className="dd-list">{more.map((e) => <MenuItem key={e.label} e={e} close={close} />)}</div>
                  <div className="dd-foot"><span>Apparence</span><ThemeSwitch /></div>
                </>
              )}
            </Dropdown>
          </nav>

          <div className="top-actions">
            {email ? (
              <>
                {page !== "orders" && page !== "submit" && <button type="button" className="primary sm hide-md" onClick={onStart}><Icon name="plus" size={18} />Nouvelle conversion</button>}
                <Dropdown label="Mon compte" trigger={() => <span className="avatar" aria-hidden="true">{initial}</span>}>
                  {(close) => (
                    <>
                      <div className="dd-who"><span className="avatar lg" aria-hidden="true">{initial}</span><div><b>Mon compte</b><small>{email}</small></div></div>
                      <div className="dd-list">
                        <MenuItem close={close} e={{ icon: "package", label: "Mes commandes", run: () => go("orders") }} />
                        {hasPlan && <MenuItem close={close} e={{ icon: "server", label: "Mon hébergement", run: () => go("hosting") }} />}
                        <MenuItem close={close} e={{ icon: "globe", label: "Mes sites", run: () => go("sites") }} />
                        <MenuItem close={close} e={{ icon: "logout", label: "Se déconnecter", run: onLogout }} />
                      </div>
                    </>
                  )}
                </Dropdown>
              </>
            ) : (
              <>
                <button type="button" className="ghost sm hide-md" onClick={onLogin}>Se connecter</button>
                <button type="button" className="primary sm" onClick={onStart}>Commencer</button>
              </>
            )}
            <button type="button" className="icon-btn burger" aria-label={drawer ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={drawer} aria-controls="mobile-menu" onClick={() => setDrawer(!drawer)}>
              <Icon name={drawer ? "x" : "menu"} size={22} />
            </button>
          </div>
        </div>
      </header>

      {drawer && (
        <div className="mobile-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeDrawer(); }}>
          <nav className="mobile-menu" id="mobile-menu" aria-label="Menu">
            {email && <div className="dd-who"><span className="avatar lg" aria-hidden="true">{initial}</span><div><b>Mon compte</b><small>{email}</small></div></div>}
            <div className="mm-group">{main.map((e) => <MenuItem key={e.label} e={e} close={closeDrawer} />)}</div>
            <p className="mm-title">Plus</p>
            <div className="mm-group">{more.filter((m) => !main.some((x) => x.label === m.label)).map((e) => <MenuItem key={e.label} e={e} close={closeDrawer} />)}</div>
            <div className="dd-foot"><span>Apparence</span><ThemeSwitch /></div>
            <div className="mm-cta">
              {email
                ? <button type="button" className="full" onClick={() => { closeDrawer(); onLogout(); }}><Icon name="logout" size={18} />Se déconnecter</button>
                : <><button type="button" className="primary full" onClick={() => { closeDrawer(); onStart(); }}>Créer un compte</button><button type="button" className="full" onClick={() => { closeDrawer(); onLogin(); }}>Se connecter</button></>}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
