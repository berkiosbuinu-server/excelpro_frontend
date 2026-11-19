import { useState } from "react";
import { BILLING_LABEL, BILLING_MONTHS, PLANS, fmtUsd, perMonth, priceFor, type Billing, type Plan } from "./plans";

const ROWS: [string, (p: Plan) => string | boolean][] = [
  ["Classeurs hébergés", (p) => p.limits.workbooks], ["Lignes de données", (p) => p.limits.rows], ["Appels API par mois", (p) => p.limits.calls],
  ["Clés d'accès", (p) => p.limits.keys], ["Requêtes et actions enregistrées", (p) => p.limits.queries], ["Utilisateurs connectés", (p) => p.users],
  ["Rôles et droits", (p) => p.roles], ["Rapports sur plusieurs tables", (p) => p.joins], ["Sauvegardes conservées", (p) => p.limits.backups], ["Support", (p) => p.limits.support],
];
const FAQ: [string, string][] = [
  ["Que signifie « annuel −30 % » ?", "Vous payez 8,4 mois au lieu de 12 : par exemple Équipe coûte 126 $ par an au lieu de 180 $."],
  ["Je dépasse mes limites, que se passe-t-il ?", "Vous êtes prévenu avant d'atteindre la limite. Vos données restent intactes ; vous passez à l'offre supérieure quand vous voulez."],
  ["Puis-je changer d'offre ?", "Oui, à tout moment. Vos classeurs, clés et requêtes sont conservés."],
  ["Comment activer mon offre ?", "Vous choisissez l'offre et la période, vous payez par mobile money, puis vous indiquez la référence de la transaction. Nous vérifions le paiement et activons votre offre (en général sous 24 h)."],
  ["Que signifie « 3 mois + 1 offert » ?", "Vous payez 3 mois et obtenez 4 mois de service : par exemple Équipe coûte 45 $ pour 4 mois au lieu de 60 $."],
  ["Comment payer ?", "Par carte ou par mobile money (M-PESA, Orange Money, Airtel Money), ou par transfert, selon votre pays."],
  ["Qu'est-ce qu'un client final (offre Éditeur) ?", "Une entreprise à qui vous revendez votre application Excel. Chacune a ses propres données, séparées des autres."],
];

/** Tarifs d'hébergement : bascule mensuel / annuel, 4 offres, tableau comparatif, questions fréquentes. */
export function Plans({ onChoose }: { onChoose: (p: Plan, billing: Billing) => void }) {
  const [billing, setBilling] = useState<Billing>("monthly");
  return (
    <div className="plans">
      <p className="trial-banner"><b>Promotion : 3 mois payés = 4 mois de service</b>, et −30 % en paiement annuel.</p>
      <div className="billing" role="group" aria-label="Période de facturation">
        {(["monthly", "quarterly", "yearly"] as Billing[]).map((b) => (
          <button key={b} className={billing === b ? "on" : ""} aria-pressed={billing === b} onClick={() => setBilling(b)}>
            {BILLING_LABEL[b].replace(/ (−30 %|\+ 1 offert)$/, "")}{b === "quarterly" && <span className="save">1 mois offert</span>}{b === "yearly" && <span className="save">−30 %</span>}
          </button>
        ))}
      </div>
      <div className="grid plan-grid">
        {PLANS.map((p) => (
          <div className={`card plan ${p.featured ? "featured" : ""}`} key={p.id}>
            {p.featured && <span className="ribbon">Populaire</span>}
            <h3>{p.name}</h3>
            <p className="muted">{p.audience}</p>
            <p className="price">{fmtUsd(perMonth(p.monthly, billing))}<small>/mois</small></p>
            <p className="muted plan-sub">{billing === "monthly" ? "sans engagement" : billing === "quarterly" ? `${fmtUsd(priceFor(p.monthly, billing))} pour ${BILLING_MONTHS[billing]} mois (1 mois offert)` : `${fmtUsd(priceFor(p.monthly, billing))} par an (au lieu de ${fmtUsd(p.monthly * 12)})`}</p>
            <ul className="ticks">
              <li>{p.limits.workbooks} classeur(s) · {p.limits.rows} lignes</li>
              {p.extra && <li>{p.extra}</li>}
              {p.features.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <button className={p.featured ? "primary" : ""} onClick={() => onChoose(p, billing)}>Choisir {p.name}</button>
          </div>
        ))}
      </div>

      <details className="compare">
        <summary>Comparer les offres en détail</summary>
        <div className="scroll-x">
          <table>
            <thead><tr><th /> {PLANS.map((p) => <th key={p.id}>{p.name}</th>)}</tr></thead>
            <tbody>{ROWS.map(([label, f]) => (
              <tr key={label}><th scope="row">{label}</th>{PLANS.map((p) => { const v = f(p); return <td key={p.id}>{v === true ? "✔" : v === false ? "—" : v}</td>; })}</tr>
            ))}</tbody>
          </table>
        </div>
      </details>

      <div className="faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p className="muted">{a}</p></details>)}</div>
      <p className="muted center">Prix en dollars américains. Les limites de votre offre sont appliquées ; vous êtes prévenu à 80 % d'utilisation.</p>
    </div>
  );
}
