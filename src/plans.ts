/** Offres d'hébergement BERKIOS (prix en dollars américains). L'annuel = 12 mois − 30 % (8,4 mois payés). */
export const ANNUAL_DISCOUNT = 0.3;
export type PlanId = "solo" | "equipe" | "entreprise" | "editeur";
export type Plan = {
  id: PlanId; name: string; audience: string; monthly: number; featured?: boolean;
  limits: { workbooks: string; rows: string; calls: string; keys: string; queries: string; backups: string; support: string };
  users: string; roles: string; joins: boolean; extra?: string; features: string[];
};

export const PLANS: Plan[] = [
  { id: "solo", name: "Solo", audience: "Indépendant, un seul classeur", monthly: 3,
    limits: { workbooks: "1", rows: "10 000", calls: "30 000", keys: "2", queries: "10", backups: "7 jours", support: "E-mail" },
    users: "—", roles: "Non", joins: false,
    features: ["1 classeur hébergé", "Tableau de bord et code VBA prêt à copier", "Requêtes, totaux et actions sans code"] },
  { id: "equipe", name: "Équipe", audience: "Petite entreprise", monthly: 15, featured: true,
    limits: { workbooks: "3", rows: "200 000", calls: "500 000", keys: "5", queries: "30", backups: "14 jours", support: "E-mail" },
    users: "10 utilisateurs connectés", roles: "Rôles et droits par table", joins: false,
    features: ["Connexion par mot de passe (haché sur le serveur)", "Rôles : lecture, saisie, administration", "Essai gratuit de 14 jours"] },
  { id: "entreprise", name: "Entreprise", audience: "Plusieurs classeurs, plusieurs métiers", monthly: 39,
    limits: { workbooks: "10", rows: "1 000 000", calls: "3 000 000", keys: "20", queries: "60", backups: "30 jours", support: "Prioritaire" },
    users: "100 utilisateurs connectés", roles: "Rôles, droits par ligne", joins: true,
    features: ["Droits par ligne (un vendeur ne voit que ses factures)", "Rapports sur plusieurs tables (client, produit, vendeur…)", "Export CSV des rapports"] },
  { id: "editeur", name: "Éditeur (SaaS)", audience: "Vous vendez votre application Excel", monthly: 79,
    limits: { workbooks: "10 + 1 par client", rows: "1 000 000 + par client", calls: "3 000 000", keys: "50", queries: "60", backups: "30 jours", support: "Prioritaire" },
    users: "Illimités", roles: "Rôles, droits par ligne", joins: true,
    extra: "5 clients finaux inclus, puis 3 $ par client supplémentaire",
    features: ["Données séparées pour chaque client final", "Jetons partenaires pour créer vos clients", "Marque blanche en option : +20 $/mois"] },
];

/** Prix annuel : 12 mois − 30 %, arrondi au dollar. */
export const annualPrice = (monthly: number) => Math.round(monthly * 12 * (1 - ANNUAL_DISCOUNT));
/** Équivalent mensuel de l'annuel (2 décimales). */
export const annualPerMonth = (monthly: number) => Math.round((annualPrice(monthly) / 12) * 100) / 100;
export const fmtUsd = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(".", ",")} $`;
