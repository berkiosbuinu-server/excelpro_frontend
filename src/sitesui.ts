// Aides pures de la page Sites (sans accès réseau) : prix, formats, identifiants.
import type { SiteAccess } from "./sites";

export const SITE_PRICING = [
  { id: "site-starter", name: "Starter", monthly: 2, headline: "2 $ / mois", note: "Premier paiement : 5 mois (10 $), puis au mois", features: ["1 site", "100 Mo", "Adresse <nom>.sites.berkios.online", "3 versions et retour arrière"] },
  { id: "site-pro", name: "Pro", monthly: 10, headline: "10 $ / mois", note: "Annuel : 96 $ (−20 %)", features: ["5 sites", "1 Go par site", "Domaines personnalisés (3 par site)", "Variables d'environnement", "10 versions et retour arrière"] },
] as const;

export const fmtUsdCents = (c: number) => `${(c / 100).toLocaleString("fr-FR", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })} $`;
export const fmtBytes = (n: number) => (n < 1024 ? `${n} o` : n < 1048576 ? `${(n / 1024).toFixed(0)} Ko` : n < 1073741824 ? `${(n / 1048576).toFixed(1).replace(".", ",")} Mo` : `${(n / 1073741824).toFixed(2).replace(".", ",")} Go`);
export const BILLING_SITE_LABEL: Record<string, string> = { monthly: "1 mois", start5: "5 mois", yearly: "12 mois (−20 %)" };
export const TLS_LABEL: Record<string, string> = { none: "HTTPS : en attente (le domaine doit pointer vers notre serveur)", pending: "HTTPS : certificat en cours…", active: "HTTPS actif", failed: "HTTPS : certificat non obtenu, nouvel essai automatique" };
export const SITE_ID_RE = /^[a-z][a-z0-9-]{2,39}$/;
/** Identifiant proposé d'après un nom (« Ma Pharmacie » → « ma-pharmacie »). */
export function slugify(name: string): string {
  const s = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 40).replace(/-+$/g, "");
  return /^[a-z]/.test(s) ? s : s ? `site-${s}`.slice(0, 40).replace(/-+$/g, "") : "";
}
/** Message clair quand l'accès est limité (grâce ou expiré). */
export function accessNotice(a: SiteAccess): { level: "info" | "warn" | "error"; text: string } | null {
  if (a.state === "grace") return { level: "warn", text: "Votre offre a expiré : vos sites restent en ligne quelques jours, mais vous ne pouvez plus les modifier. Renouvelez-la." };
  if (a.state === "expired") return { level: "error", text: "Votre offre a expiré : vos sites sont hors ligne. Renouvelez-la pour les remettre en ligne (vos fichiers sont conservés)." };
  if (a.state === "active" && a.daysLeft !== null && a.daysLeft <= 7) return { level: "info", text: `Votre offre expire dans ${a.daysLeft} jour(s).` };
  return null;
}

/** Adresse publique du webhook (le serveur d'hébergement, pas l'API ExcelPro) : à coller dans GitHub, GitLab, Bitbucket ou Gitea. */
export const SITES_HOOK_BASE = "https://server.berkios.online/admin/v1/sites/hook";
export const hookUrl = (siteId: string) => `${SITES_HOOK_BASE}/${siteId}`;
export const GIT_STATUS_LABEL: Record<string, string> = { idle: "Pas encore déployé", running: "Déploiement en cours…", ok: "Dernier déploiement réussi", error: "Dernier déploiement en échec" };
/** Vérification légère côté navigateur (le serveur refait toujours la vraie vérification). Renvoie un message d'erreur ou "". */
export function repoUrlError(raw: string): string {
  const s = raw.trim();
  if (!s) return "Indiquez l'adresse du dépôt.";
  if (/^https?:\/\/[^/]*@/i.test(s)) return "N'indiquez ni identifiant ni jeton dans l'adresse. Pour un dépôt privé, utilisez l'adresse SSH.";
  if (/^https:\/\/[^/@\s]+\/[^\s]+$/i.test(s) || /^git@[^:/@\s]+:[^\s]+$/i.test(s) || /^ssh:\/\/git@[^/@\s]+\/[^\s]+$/i.test(s)) return "";
  return "Format attendu : https://github.com/compte/depot.git ou git@github.com:compte/depot.git";
}
export const isSshRepo = (raw: string) => /^(git@|ssh:\/\/)/i.test(raw.trim());
