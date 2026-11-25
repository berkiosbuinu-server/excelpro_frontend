// Hébergement de sites web statiques (https://server.berkios.online/admin/v1/sites) : types, appels et libellés.
import { callSites } from "./hosting";

export const SITES_DOMAIN = "sites.berkios.online";
export type SiteAccess = { state: "none" | "active" | "grace" | "expired"; expiresAt: string | null; daysLeft: number | null };
export type SiteOffer = { id: string; label: string; monthlyUsd: number; sites: number; storageMb: number; versions: number; domains: number; env: boolean; billing: { id: "monthly" | "start5" | "yearly"; months: number; label: string; amountCents: number }[] };
export type SiteRequest = { id: string; plan: string; billing: string; amountCents: number; creditCents: number; reference: string; createdAt: string };
export type SitePlan = {
  plan: string | null; label: string | null; access: SiteAccess;
  limits: { sites: number; storageMb: number; versions: number; domains: number; env: boolean } | null;
  usage: { sites: number; storageBytes: number }; pending: SiteRequest | null; offers: SiteOffer[];
};
export type SiteVersion = { n: number; createdAt: string; size: number; files: number; note: string; current: boolean };
export type SiteDomain = { domain: string; status: "pending" | "verified"; tls: "none" | "pending" | "active" | "failed"; createdAt: string; target?: { a: string | null; cname: string }; verification?: { txt: { name: string; value: string }; cname: { name: string; value: string }; note: string } };
export type SiteGit = {
  url: string; branch: string; dir: string; auto: boolean; private: boolean; deployKey: string | null; webhook: { url: string; secret: string };
  status: "idle" | "running" | "ok" | "error"; message: string; commit: string; subject: string; version: number | null; trigger: string; startedAt: string | null; finishedAt: string | null;
};
export type SiteView = {
  id: string; name: string; url: string; settings: { spa?: boolean }; currentVersion: number | null; versions: SiteVersion[]; storageBytes: number;
  domains: SiteDomain[]; env: Record<string, string>; git?: SiteGit | null; createdAt: string; updatedAt: string; deployed?: { version: number; files: number; bytes: number; ignored: number };
};
export type SiteRow = { id: string; name: string; url: string; currentVersion: number | null; storageBytes: number; domains: string[]; updatedAt: string };
export type SiteQuote = { plan: string; billing: string; months: number; fullCents: number; creditCents: number; amountCents: number };

const enc = encodeURIComponent;
export const sitesApi = {
  plan: () => callSites<SitePlan>("GET", "/me"),
  quote: (plan: string, billing: string) => callSites<SiteQuote>("GET", `/me/quote?plan=${enc(plan)}&billing=${enc(billing)}`),
  request: (b: { plan: string; billing: string; reference?: string; phone?: string }) => callSites<SiteRequest>("POST", "/me/request", { json: b }),
  list: () => callSites<SiteRow[]>("GET", ""),
  create: (id: string, name: string) => callSites<SiteView>("POST", "", { json: { id, name } }),
  get: (id: string) => callSites<SiteView>("GET", `/${enc(id)}`),
  settings: (id: string, b: { name?: string; spa?: boolean }) => callSites<SiteView>("PUT", `/${enc(id)}`, { json: b }),
  remove: (id: string) => callSites<{ id: string; removed: boolean }>("DELETE", `/${enc(id)}`),
  deploy: (id: string, archive: Blob, note: string) => callSites<SiteView>("PUT", `/${enc(id)}/deploy${note ? `?note=${enc(note)}` : ""}`, { raw: archive }),
  rollback: (id: string, version: number) => callSites<SiteView>("POST", `/${enc(id)}/rollback`, { json: { version } }),
  setEnv: (id: string, env: Record<string, string>) => callSites<SiteView>("PUT", `/${enc(id)}/env`, { json: env }),
  setGit: (id: string, b: { url: string; branch?: string; dir?: string; auto?: boolean }) => callSites<SiteView>("PUT", `/${enc(id)}/git`, { json: b }),
  deployGit: (id: string) => callSites<SiteView>("POST", `/${enc(id)}/git/deploy`, { json: {} }),
  regenGit: (id: string, b: { key?: boolean; secret?: boolean }) => callSites<SiteView>("POST", `/${enc(id)}/git/regenerate`, { json: b }),
  removeGit: (id: string) => callSites<SiteView>("DELETE", `/${enc(id)}/git`),
  addDomain: (id: string, domain: string) => callSites<SiteView>("POST", `/${enc(id)}/domains`, { json: { domain } }),
  verifyDomain: (id: string, domain: string) => callSites<{ domain: string; verified: boolean; method: string | null; site: SiteView }>("POST", `/${enc(id)}/domains/${enc(domain)}/verify`, { json: {} }),
  removeDomain: (id: string, domain: string) => callSites<SiteView>("DELETE", `/${enc(id)}/domains/${enc(domain)}`),
};

/** Offres affichées avant connexion (la page « Tarifs ») ; les montants réellement facturés viennent du serveur. */

export * from "./sitesui";
