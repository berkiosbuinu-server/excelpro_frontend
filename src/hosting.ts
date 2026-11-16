// Client de l'hébergement BERKIOS (https://server.berkios.online), appelé DIRECTEMENT depuis le navigateur.
// Le jeton est émis par le backend ExcelPro (signé, court, limité à l'entreprise du compte) : aucun secret n'est ici.
import { api } from "./api";

export type Cap = { analyzer: boolean; postgres: { configured: boolean; reachable: boolean; error?: string }; maxUploadBytes: number; formats: string[] };
export type ImportRow = { id: string; tenant: string; fileName: string; state: string; error: string | null; createdAt: string; updatedAt: string };
type Summary = Record<string, number | string | boolean | null>;
export type TableInfo = { name: string; dataRowCount: number; fields: { field: string; inferredTypes: string[]; sensitive: boolean }[] };
export type ImportView = {
  id: string; tenant: string; fileName: string; state: string; error: string | null; workbookPurged: boolean;
  progress: { table: string; done: number; total: number } | null;
  analysis: { readiness: unknown; diagnostics: { level?: string; message?: string }[]; tables: TableInfo[] };
  plan: { warnings: string[] };
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

export const hosting = {
  capabilities: () => call<Cap>("GET", "/capabilities"),
  list: () => call<ImportRow[]>("GET", "/imports"),
  get: (id: string) => call<ImportView>("GET", `/imports/${id}`),
  async upload(file: File) { return call<{ workbookId: string; fileName: string; size: number }>("PUT", `/workbooks?name=${encodeURIComponent(file.name)}`, { raw: file }); },
  create: (workbookId: string) => call<ImportView>("POST", "/imports", { json: { workbookId } }),
  dryRun: (id: string) => call<ImportView>("POST", `/imports/${id}/dry-run`),
  start: (id: string) => call<ImportView>("POST", `/imports/${id}/start`, { json: { confirm: true } }),
  remove: (id: string) => call<{ removed: boolean }>("DELETE", `/imports/${id}`),
};
