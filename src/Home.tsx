import { useState } from "react";
import type { Pricing } from "./api";
import type { Billing, Plan } from "./plans";
import { Plans } from "./Plans";
import { Transformer } from "./Hero";
import { PlatformIcon, PLATFORM_COLORS } from "./visuals";
import { LABELS } from "./labels";
import { Icon } from "./ui";

const fmt2 = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Composer son pack : on coche les plateformes, le total se calcule, puis on démarre avec cette sélection. */
function PriceBuilder({ pricing, onStart }: { pricing: Pricing | null; onStart: (platforms: string[]) => void }) {
  const [picked, setPicked] = useState<string[]>(["windows"]);
  const toggle = (p: string) => setPicked((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  const entries = pricing ? Object.entries(pricing.platforms) : [];
  const total = picked.reduce((s, p) => s + (pricing?.platforms[p] ?? 0), 0);
  return (
    <div className="builder">
      <div className="builder-tiles" role="group" aria-label="Plateformes">
        {!pricing && Object.keys(LABELS).map((k) => <div key={k} className="skeleton tile-sk" />)}
        {entries.map(([k, v]) => (
          <button type="button" key={k} aria-pressed={picked.includes(k)} className={`ptile${picked.includes(k) ? " on" : ""}`} style={{ ["--pc" as string]: PLATFORM_COLORS[k] }} onClick={() => toggle(k)}>
            <span className="ptile-ico"><PlatformIcon id={k} size={26} /></span>
            <strong>{LABELS[k] ?? k}</strong>
            <span className="ptile-price">{v} $</span>
            <span className="ptile-check" aria-hidden="true"><Icon name="check" size={14} /></span>
          </button>
        ))}
      </div>
      <aside className="builder-sum" aria-live="polite">
        <p className="muted">Votre sélection</p>
        <p className="sum-total">{total} <small>$</small></p>
        <p className="sum-list">{picked.length ? picked.map((p) => LABELS[p] ?? p).join(", ") : "Choisissez au moins une plateforme"}</p>
        <p className="muted">Paiement unique par plateforme, sans abonnement.</p>
        <button type="button" className="primary big full" disabled={!picked.length} onClick={() => onStart(picked)}>Commencer avec cette sélection</button>
      </aside>
    </div>
  );
}

/** Estimation indicative des frais de vérification d'après les tarifs publiés. */
function Estimator({ rates }: { rates: Pricing["check_fee_rates"] }) {
  const [v, setV] = useState({ i: 2, m: 5, f: 200, mb: 2 });
  const n = (s: string) => Number(String(s).replace(",", "."));
  const r = { i: n(rates.per_interface), m: n(rates.per_macro), f: n(rates.per_formula), mb: n(rates.per_mb), min: n(rates.minimum) };
  const ok = Object.values(r).every((x) => Number.isFinite(x));
  const fee = ok ? Math.max(r.min, v.i * r.i + v.m * r.m + v.f * r.f + v.mb * r.mb) : 0;
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: Math.max(0, Number(e.target.value) || 0) });
  return (
    <div className="estimator">
      <div className="est-copy">
        <h3>Vérification de votre fichier avant conversion</h3>
        <p>Nos experts ouvrent et lancent votre application sur leurs machines : macros, VBA, formules, UserForms. Vous recevez un rapport détaillé <strong>avant</strong> de payer la conversion.</p>
        <ul className="rates">
          <li><strong>{rates.per_interface} $</strong> par interface (feuille ou UserForm)</li>
          <li><strong>{rates.per_macro} $</strong> par macro VBA</li>
          <li><strong>{rates.per_formula} $</strong> par formule</li>
          <li><strong>{rates.per_mb} $</strong> par Mo de fichier</li>
        </ul>
      </div>
      {ok ? (
        <div className="est-calc">
          <p className="est-title">Estimez vos frais</p>
          <div className="est-grid">
            <label>Interfaces<input type="number" min={0} inputMode="numeric" value={v.i} onChange={set("i")} /></label>
            <label>Macros VBA<input type="number" min={0} inputMode="numeric" value={v.m} onChange={set("m")} /></label>
            <label>Formules<input type="number" min={0} inputMode="numeric" value={v.f} onChange={set("f")} /></label>
            <label>Taille (Mo)<input type="number" min={0} inputMode="decimal" value={v.mb} onChange={set("mb")} /></label>
          </div>
          <p className="est-out"><span className="muted">Environ</span> <strong>{fmt2(fee)} $</strong></p>
          <p className="muted">Le montant exact est calculé dès l'envoi de votre fichier. Minimum : {rates.minimum} $.</p>
        </div>
      ) : (
        <div className="est-calc"><p className="muted">À partir de</p><p className="est-out"><strong>{rates.minimum} $</strong></p><p className="muted">Calculé automatiquement dès l'envoi de votre fichier.</p></div>
      )}
    </div>
  );
}

export function Home({ pricing, onStart, onHost, goSection }: { pricing: Pricing | null; onStart: (platforms?: string[]) => void; onHost: (p: Plan, b: Billing) => void; goSection: (id: string) => void }) {
  return (
    <>
      <section className="hero">
        <div className="hero-in">
          <div className="hero-copy">
            <h1>Votre classeur Excel devient une vraie application</h1>
            <p className="lead">Nous testons vos macros, formules et UserForms, puis nous les convertissons pour Windows, Android, iOS, macOS, Linux ou le Web. Vous pouvez aussi héberger vos données et publier votre site.</p>
            <div className="hero-actions">
              <button type="button" className="primary big" onClick={() => onStart()}>Soumettre mon classeur</button>
              <button type="button" className="big ghost" onClick={() => goSection("tarifs")}>Voir les tarifs</button>
            </div>
            <ul className="trust">
              <li><Icon name="check" size={18} />Rapport de vérification avant toute conversion</li>
              <li><Icon name="check" size={18} />Paiement par mobile money ou par carte</li>
              <li><Icon name="check" size={18} />Livraison avec une clé de récupération</li>
            </ul>
          </div>
          <Transformer />
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head"><h2>De votre fichier à votre application, en trois étapes</h2></div>
          <ol className="flow">
            {[
              ["upload", "Envoyez votre classeur", "Déposez votre fichier .xlsx ou .xlsm. L'analyse est automatique."],
              ["clipboard", "Recevez le rapport", "Nos experts testent macros, formules et UserForms avant toute conversion."],
              ["download", "Récupérez votre application", "Une clé de récupération vous donne accès à vos livrables, pour chaque plateforme."],
            ].map(([ic, t, d], i) => (
              <li className="flow-step" key={t}>
                <span className="flow-num">{i + 1}</span>
                <span className="flow-ico"><Icon name={ic as "upload"} size={22} /></span>
                <h3>{t}</h3><p className="muted">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="tarifs" className="sec alt">
        <div className="wrap">
          <div className="sec-head"><h2>Tarifs</h2><p className="muted">Applications autonomes : un paiement unique par plateforme.</p></div>
          <PriceBuilder pricing={pricing} onStart={(p) => onStart(p)} />
          {pricing && <Estimator rates={pricing.check_fee_rates} />}
        </div>
      </section>

      <section id="hebergement" className="sec">
        <div className="wrap">
          <div className="sec-head"><h2>Hébergement</h2><p className="muted">Votre Excel devient une base de données en ligne, pour vous, votre entreprise ou vos propres clients.</p></div>
          <Plans onChoose={onHost} />
        </div>
      </section>

      <section className="wrap">
        <div className="cta-band">
          <h2>Prêt à transformer votre Excel ?</h2>
          <p>Envoyez votre classeur : vous connaissez le prix de la vérification dès l'envoi.</p>
          <button type="button" className="big" onClick={() => onStart()}>Soumettre mon classeur</button>
        </div>
      </section>
    </>
  );
}
