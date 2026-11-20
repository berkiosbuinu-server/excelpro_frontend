/** Offres d'hébergement BERKIOS (prix en dollars américains). L'annuel = 12 mois − 30 % (8,4 mois payés). */
export const ANNUAL_DISCOUNT = 0.3;
export type EditeurTierId = "editeur10" | "editeur50" | "editeur100" | "editeur500";
export type PlanId = "solo" | "equipe" | "entreprise" | "editeur" | EditeurTierId;
/** Palier de l'offre Éditeur : le prix suit le nombre de clients finaux. */
export type Tier = { id: EditeurTierId; clients: number; monthly: number; rows: string; calls: string };
export type Plan = {
  id: PlanId; name: string; audience: string; monthly: number; featured?: boolean;
  limits: { workbooks: string; rows: string; calls: string; keys: string; queries: string; backups: string; support: string };
  users: string; roles: string; joins: boolean; extra?: string; features: string[]; tiers?: Tier[];
};

export const EDITEUR_TIERS: Tier[] = [
  { id: "editeur10", clients: 10, monthly: 30, rows: "300 000", calls: "1 000 000" },
  { id: "editeur50", clients: 50, monthly: 89, rows: "1 000 000", calls: "3 000 000" },
  { id: "editeur100", clients: 100, monthly: 149, rows: "2 000 000", calls: "6 000 000" },
  { id: "editeur500", clients: 500, monthly: 299, rows: "5 000 000", calls: "15 000 000" },
];
/** Intitulé d'un palier : « 11 à 50 clients ». */
export const tierLabel = (t: Tier, i: number, all: Tier[] = EDITEUR_TIERS) => (i === 0 ? `1 à ${t.clients} clients` : `${all[i - 1].clients + 1} à ${t.clients} clients`);
/** Prix par client à pleine capacité du palier (en dollars, 2 décimales). */
export const perClient = (t: Tier) => Math.round((t.monthly / t.clients) * 100) / 100;
/** Offre réellement choisie : pour Éditeur, le palier remplace l'identifiant, le prix et le nom. */
export function planForTier(p: Plan, t: Tier): Plan {
  const i = (p.tiers ?? []).findIndex((x) => x.id === t.id);
  return { ...p, id: t.id, monthly: t.monthly, name: `Éditeur · ${tierLabel(t, Math.max(0, i), p.tiers)}`, limits: { ...p.limits, rows: t.rows, calls: t.calls }, tiers: undefined };
}

export const PLANS: Plan[] = [
  { id: "solo", name: "Solo", audience: "Indépendant, un seul classeur", monthly: 3,
    limits: { workbooks: "1", rows: "10 000", calls: "30 000", keys: "2", queries: "10", backups: "7 jours", support: "E-mail" },
    users: "—", roles: "Non", joins: false,
    features: ["1 classeur hébergé", "Tableau de bord et code VBA prêt à copier", "Requêtes, totaux et actions sans code"] },
  { id: "equipe", name: "Équipe", audience: "Petite entreprise", monthly: 15, featured: true,
    limits: { workbooks: "3", rows: "200 000", calls: "500 000", keys: "5", queries: "30", backups: "14 jours", support: "E-mail" },
    users: "10 utilisateurs connectés", roles: "Rôles et droits par table", joins: false,
    features: ["Connexion par mot de passe (haché sur le serveur)", "Rôles : lecture, saisie, administration", "Support par e-mail"] },
  { id: "entreprise", name: "Entreprise", audience: "Plusieurs classeurs, plusieurs métiers", monthly: 39,
    limits: { workbooks: "10", rows: "1 000 000", calls: "3 000 000", keys: "20", queries: "60", backups: "30 jours", support: "Prioritaire" },
    users: "100 utilisateurs connectés", roles: "Rôles, droits par ligne", joins: true,
    features: ["Droits par ligne (un vendeur ne voit que ses factures)", "Rapports sur plusieurs tables (client, produit, vendeur…)", "Export CSV des rapports"] },
  { id: "editeur", name: "Éditeur (SaaS)", audience: "Vous vendez votre application Excel", monthly: 30, tiers: EDITEUR_TIERS,
    limits: { workbooks: "10", rows: "300 000 à 5 000 000", calls: "1 000 000 à 15 000 000", keys: "50", queries: "60", backups: "30 jours", support: "Prioritaire" },
    users: "Illimités", roles: "Rôles, droits par ligne", joins: true,
    extra: "Le prix suit votre nombre de clients : dès 30 $ pour 10 clients",
    features: ["Données séparées pour chaque client final", "Jetons partenaires pour créer vos clients", "Marque blanche en option : +20 $/mois"] },
];

export type Billing = "monthly" | "quarterly" | "yearly";
/** Durée de service obtenue : 3 mois payés = 4 mois (1 mois offert) ; annuel = 12 mois à −30 %. */
export const BILLING_MONTHS: Record<Billing, number> = { monthly: 1, quarterly: 4, yearly: 12 };
export const BILLING_LABEL: Record<Billing, string> = { monthly: "Mensuel", quarterly: "3 mois + 1 offert", yearly: "Annuel −30 %" };
/** Montant payé (en dollars) pour une période. */
export const priceFor = (monthly: number, b: Billing) => (b === "monthly" ? monthly : b === "quarterly" ? monthly * 3 : annualPrice(monthly));
/** Équivalent par mois de service. */
export const perMonth = (monthly: number, b: Billing) => Math.round((priceFor(monthly, b) / BILLING_MONTHS[b]) * 100) / 100;
/** Prix annuel : 12 mois − 30 %, arrondi au dollar. */
export const annualPrice = (monthly: number) => Math.round(monthly * 12 * (1 - ANNUAL_DISCOUNT));
/** Équivalent mensuel de l'annuel (2 décimales). */
export const annualPerMonth = (monthly: number) => Math.round((annualPrice(monthly) / 12) * 100) / 100;
export const fmtUsd = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(".", ",")} $`;

/** Prix mensuel d'une offre à partir de son identifiant (l'ancienne offre Éditeur valait 79 $) ; null si inconnue. */
export const monthlyOf = (id: string | null | undefined): number | null =>
  PLANS.find((p) => p.id === id)?.monthly !== undefined && id !== "editeur" ? PLANS.find((p) => p.id === id)!.monthly : EDITEUR_TIERS.find((t) => t.id === id)?.monthly ?? (id === "editeur" ? 79 : null);
/** Palier suivant de l'offre Éditeur (pour inviter à monter quand la limite de clients approche) ; null au dernier palier. */
export const nextTier = (id: string | null | undefined): Tier | null => { const i = EDITEUR_TIERS.findIndex((t) => t.id === id); return i >= 0 ? EDITEUR_TIERS[i + 1] ?? null : null; };
