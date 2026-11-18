// Client de l'hébergement BERKIOS (https://server.berkios.online), appelé DIRECTEMENT depuis le navigateur.
// Le jeton est émis par le backend ExcelPro (signé, court, limité à l'entreprise du compte) : aucun secret n'est ici.
import { api } from "./api";
import type { DataRow, DataTable, SavedDef, SavedItem, Scalar } from "./dataops";

export type Cap = { analyzer: boolean; postgres: { configured: boolean; reachable: boolean; error?: string }; maxUploadBytes: number; formats: string[] };
export type ImportRow = { id: string; tenant: string; fileName: string; state: string; error: string | null; createdAt: string; updatedAt: string };
type Summary = Record<string, number | string | boolean | null>;
export type SensitiveMode = "reject" | "hash" | "discard";
export const SENSITIVE_LABEL: Record<SensitiveMode, string> = { reject: "Rejeter la ligne", hash: "Protéger (hachage scrypt)", discard: "Ne pas importer la valeur" };
export type TableInfo = { id?: string; name: string; dataRowCount: number; fields: { field: string; sourceHeader?: string; inferredTypes: string[]; sensitive: boolean }[] };
type Mapping = Record<string, { fields?: Record<string, { sensitiveMode?: SensitiveMode | null; [k: string]: unknown }>; [k: string]: unknown }>;
export type PlanTable = { sourceId: string; table: string; fields: { name: string; sourceHeader: string; sensitive: boolean; sensitiveMode?: SensitiveMode | null }[] };
export type ImportView = {
  id: string; tenant: string; fileName: string; state: string; error: string | null; workbookPurged: boolean;
  progress: { table: string; done: number; total: number } | null;
  options: { tenant: string; mapping: Mapping };
  analysis: { readiness: unknown; diagnostics: { level?: string; message?: string }[]; tables: TableInfo[] };
  plan: { warnings: string[]; tables: PlanTable[] };
  dryRun: { status: string; summary: Summary } | null;
  report: { status: string; summary: Summary } | null;
};

export const STATE_LABEL: Record<string, string> = {
  prepared: "Prête à simuler", dry_run: "Simulation faite", running: "Importation en cours", completed: "Terminée",
  failed: "Échec", interrupted: "Interrompue (reprenable)",
};

let cache: { token: string; exp: number; url: string } | null = null;

async function connection(force = false) {
  if (!force && cache && cache.exp - 60 > Date.now() / 1000) return cache;
  const t = await api.hostingToken();
  cache = { token: t.token, exp: t.expires_at, url: t.server_url.replace(/\/+$/, "") };
  return cache;
}
export const resetHostingSession = () => { cache = null; };

async function call<T>(method: string, path: string, opts: { json?: unknown; raw?: Blob } = {}, retried = false): Promise<T> {
  const c = await connection(retried);
  const headers: Record<string, string> = { Accept: "application/json", Authorization: `Bearer ${c.token}` };
  if (opts.json !== undefined) headers["Content-Type"] = "application/json";
  if (opts.raw) headers["Content-Type"] = "application/octet-stream";
  let res: Response;
  try {
    res = await fetch(`${c.url}/admin/v1/excel-cloud${path}`, {
      method, headers, credentials: "omit", signal: AbortSignal.timeout(120_000),
      body: opts.raw ?? (opts.json !== undefined ? JSON.stringify(opts.json) : undefined),
    });
  } catch {
    throw new Error("Serveur d'hébergement injoignable. Vérifiez votre connexion et réessayez.");
  }
  if (res.status === 401 && !retried) return call<T>(method, path, opts, true); // jeton expiré : on en demande un nouveau une fois
  let body: { data?: T; error?: { message?: string } } = {};
  try { body = await res.json(); } catch { /* corps vide */ }
  if (!res.ok) throw new Error(body.error?.message || `Requête refusée (code ${res.status}).`);
  return body.data as T;
}

/** Copie des options avec le traitement d'un champ sensible modifié (le serveur recalcule le plan et invalide la simulation). */
export function withSensitiveMode(options: ImportView["options"], sourceId: string, key: string, mode: SensitiveMode): ImportView["options"] {
  const mapping = JSON.parse(JSON.stringify(options.mapping ?? {})) as Mapping;
  const t = (mapping[sourceId] ??= {});
  ((t.fields ??= {})[key] ??= {}).sensitiveMode = mode;
  return { ...options, mapping };
}

export type DataPage = { data: DataRow[]; total: number; limit: number; offset: number };
export type ListQuery = { limit?: number; offset?: number; orderBy?: string; direction?: "asc" | "desc"; filters?: Record<string, string> };
const enc = encodeURIComponent;
function listQs(q: ListQuery) {
  const p = new URLSearchParams();
  if (q.limit) p.set("limit", String(q.limit)); if (q.offset) p.set("offset", String(q.offset));
  if (q.orderBy) p.set("orderBy", q.orderBy); if (q.direction) p.set("direction", q.direction);
  for (const [k, v] of Object.entries(q.filters ?? {})) if (v !== "") p.set(`f.${k}`, v);
  const s = p.toString(); return s ? `?${s}` : "";
}
/** Accès aux lignes publiées (API de données générée par le serveur). */
export const dataApi = {
  schema: (id: string) => call<{ tables: DataTable[] }>("GET", `/imports/${id}/data`),
  list: (id: string, table: string, q: ListQuery = {}) => call<DataPage>("GET", `/imports/${id}/data/${enc(table)}${listQs(q)}`),
  insert: (id: string, table: string, values: Record<string, Scalar>) => call<DataRow>("POST", `/imports/${id}/data/${enc(table)}`, { json: { values } }),
  update: (id: string, table: string, key: string, expectedVersion: number, values: Record<string, Scalar>) => call<DataRow>("PUT", `/imports/${id}/data/${enc(table)}/${enc(key)}`, { json: { expectedVersion, values } }),
  remove: (id: string, table: string, key: string, expectedVersion: number) => call<{ deleted: boolean }>("DELETE", `/imports/${id}/data/${enc(table)}/${enc(key)}`, { json: { expectedVersion } }),
};

export type ApiKey = { id: string; label: string; scope: "rw" | "ro" | "auth"; createdAt: string; lastUsedAt: string | null };
export type NewApiKey = ApiKey & { key: string };
/** Clés d'API d'un classeur (pour Power Query, macros VBA, applications). Le secret n'est renvoyé qu'à la création. */
export const keysApi = {
  list: (id: string) => call<ApiKey[]>("GET", `/imports/${id}/keys`),
  create: (id: string, label: string, scope: "rw" | "ro" | "auth") => call<NewApiKey>("POST", `/imports/${id}/keys`, { json: { label, scope } }),
  revoke: (id: string, keyId: string) => call<{ id: string; revoked: boolean }>("DELETE", `/imports/${id}/keys/${keyId}`),
};
/** Requêtes (lecture, calculs) et actions (écriture) enregistrées : routes personnalisées du classeur, créées sans code. */
export const queriesApi = {
  list: (id: string) => call<SavedItem[]>("GET", `/imports/${id}/queries`),
  save: (id: string, name: string, kind: "query" | "action", def: SavedDef) => call<SavedItem>("POST", `/imports/${id}/queries`, { json: { name, kind, def } }),
  remove: (id: string, name: string) => call<{ name: string; deleted: boolean }>("DELETE", `/imports/${id}/queries/${enc(name)}`),
  preview: (id: string, def: SavedDef, params: Record<string, string>) => call<DataPage>("POST", `/imports/${id}/queries/preview`, { json: { def, params } }),
};
export const serverBase = async () => (await connection()).url;

export const hosting = {
  update: (id: string, options: ImportView["options"]) => call<ImportView>("PUT", `/imports/${id}`, { json: options }),
  capabilities: () => call<Cap>("GET", "/capabilities"),
  list: () => call<ImportRow[]>("GET", "/imports"),
  get: (id: string) => call<ImportView>("GET", `/imports/${id}`),
  async upload(file: File) { return call<{ workbookId: string; fileName: string; size: number }>("PUT", `/workbooks?name=${encodeURIComponent(file.name)}`, { raw: file }); },
  create: (workbookId: string) => call<ImportView>("POST", "/imports", { json: { workbookId } }),
  dryRun: (id: string) => call<ImportView>("POST", `/imports/${id}/dry-run`),
  start: (id: string) => call<ImportView>("POST", `/imports/${id}/start`, { json: { confirm: true } }),
  remove: (id: string) => call<{ removed: boolean }>("DELETE", `/imports/${id}`),
};
