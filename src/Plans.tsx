import { useState } from "react";
import { PLANS, annualPrice, annualPerMonth, fmtUsd, type Plan } from "./plans";

const ROWS: [string, (p: Plan) => string | boolean][] = [
  ["Classeurs hébergés", (p) => p.limits.workbooks], ["Lignes de données", (p) => p.limits.rows], ["Appels API par mois", (p) => p.limits.calls],
  ["Clés d'accès", (p) => p.limits.keys], ["Requêtes et actions enregistrées", (p) => p.limits.queries], ["Utilisateurs connectés", (p) => p.users],
  ["Rôles et droits", (p) => p.roles], ["Rapports sur plusieurs tables", (p) => p.joins], ["Sauvegardes conservées", (p) => p.limits.backups], ["Support", (p) => p.limits.support],
];
const FAQ: [string, string][] = [
  ["Que signifie « annuel −30 % » ?", "Vous payez 8,4 mois au lieu de 12 : par exemple Équipe coûte 126 $ par an au lieu de 180 $."],
  ["Je dépasse mes limites, que se passe-t-il ?", "Vous êtes prévenu avant d'atteindre la limite. Vos données restent intactes ; vous passez à l'offre supérieure quand vous voulez."],
  ["Puis-je changer d'offre ?", "Oui, à tout moment. Vos classeurs, clés et requêtes sont conservés."],
  ["Comment payer ?", "Par carte ou par mobile money (M-PESA, Orange Money, Airtel Money), ou par transfert, selon votre pays."],
  ["Qu'est-ce qu'un client final (offre Éditeur) ?", "Une entreprise à qui vous revendez votre application Excel. Chacune a ses propres données, séparées des autres."],
];

/** Tarifs d'hébergement : bascule mensuel / annuel, 4 offres, tableau comparatif, questions fréquentes. */
export function Plans({ onChoose }: { onChoose: (p: Plan, yearly: boolean) => void }) {
  const [yearly, setYearly] = useState(false);
  return (
    <div className="plans">
      <div className="billing" role="group" aria-label="Période de facturation">
        <button className={!yearly ? "on" : ""} aria-pressed={!yearly} onClick={() => setYearly(false)}>Mensuel</button>
        <button className={yearly ? "on" : ""} aria-pressed={yearly} onClick={() => setYearly(true)}>Annuel <span className="save">−30 %</span></button>
      </div>
      <div className="grid plan-grid">
        {PLANS.map((p) => (
          <div className={`card plan ${p.featured ? "featured" : ""}`} key={p.id}>
            {p.featured && <span className="ribbon">Populaire</span>}
            <h3>{p.name}</h3>
            <p className="muted">{p.audience}</p>
            <p className="price">{yearly ? fmtUsd(annualPerMonth(p.monthly)) : fmtUsd(p.monthly)}<small>/mois</small></p>
            <p className="muted plan-sub">{yearly ? `${fmtUsd(annualPrice(p.monthly))} facturés par an (au lieu de ${fmtUsd(p.monthly * 12)})` : "sans engagement"}</p>
            <ul className="ticks">
              <li>{p.limits.workbooks} classeur(s) · {p.limits.rows} lignes</li>
              {p.extra && <li>{p.extra}</li>}
              {p.features.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <button className={p.featured ? "primary" : ""} onClick={() => onChoose(p, yearly)}>Choisir {p.name}</button>
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
      <p className="muted center">Prix en dollars américains. Les limites seront appliquées progressivement ; vous serez prévenu à 80 % d'utilisation.</p>
    </div>
  );
}
