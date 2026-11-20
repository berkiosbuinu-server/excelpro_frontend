// Logique pure (sans réseau ni Office) partagée par la page Hosting et l'add-in Excel :
// conversion des valeurs, construction d'une feuille à partir des lignes du serveur, et calcul des changements à renvoyer.
export type Scalar = string | number | boolean | null;
export type DataField = { name: string; type: string; nullable: boolean; secret: boolean };
export type DataTable = { table: string; primaryKey: string; generatedPrimaryKey: boolean; fields: DataField[] };
export type DataRow = Record<string, Scalar>;

/** Requêtes et actions enregistrées sur le serveur (routes personnalisées d'un classeur). */
export type SavedValue = string | number | boolean | null;
export type SavedParam = { name: string; optional?: boolean; col?: string; op?: string; type?: string; required?: boolean; fields?: string[] };
export type SavedDef = {
  table: string; description?: string; op?: "update" | "insert";
  columns?: (string | { col: string; as?: string })[]; joins?: { table: string; type?: "left" | "inner"; on: { left: string; right: string }[] }[]; groupBy?: string[]; aggregates?: { fn: string; col?: string; as?: string }[];
  filters?: { col: string; op: string; value?: SavedValue; param?: string; optional?: boolean }[];
  orderBy?: string; direction?: "asc" | "desc"; limit?: number;
  set?: { col: string; value?: SavedValue; param?: string }[];
};
export type SavedItem = { name: string; kind: "query" | "action" | "procedure"; def: SavedDef; params: SavedParam[]; valid: boolean; error?: string; createdAt: string; updatedAt: string };

/** Droits par rôle d'un classeur (appliqués aux utilisateurs connectés). */
export type RowRule = { col: string; value: string }; // value : « $user » (identifiant de connexion), « $user.colonne » (fiche de l'utilisateur) ou une valeur fixe
export type RoleRights = { tables: Record<string, string[]>; queries: string[]; actions: string[]; rows?: Record<string, RowRule> };
export type RoleSource = { table: string; match: string; column: string };
/** Isolation par client : une application vendue à plusieurs entreprises. Chaque ligne porte le client (ex. pharmacy_id) ; chaque utilisateur n'en voit que les siennes. */
export type Isolation = { column: string; value?: string; exempt?: string[]; clientTable?: string };
export type Policy = { roleColumn?: string; roleSource?: RoleSource; isolation?: Isolation; roles: Record<string, RoleRights> };

export const VERSION_COL = "_berkios_version";
const NUM_RE = /^(numeric|decimal|int|integer|bigint|smallint|double|real|float)/i;
const DATE_RE = /^(date|timestamp)/i;
export const isNumericType = (t: string) => NUM_RE.test(t.trim());
export const isDateType = (t: string) => DATE_RE.test(t.trim());
export const isBoolType = (t: string) => /^bool/i.test(t.trim());

/** Colonnes affichées/éditables : la clé générée (lecture seule) puis les champs non secrets. Les champs hachés ne sont jamais présents. */
export function columnsOf(t: DataTable): { name: string; type: string; readOnly: boolean }[] {
  const cols = t.fields.filter((f) => !f.secret).map((f) => ({ name: f.name, type: f.type, readOnly: false }));
  return t.generatedPrimaryKey ? [{ name: t.primaryKey, type: "uuid", readOnly: true }, ...cols] : cols;
}

/** Numéro de série Excel (1900) → date ISO « AAAA-MM-JJ » (ou avec l'heure si fractionnaire). */
export function serialToIso(n: number): string {
  const ms = Math.round((n - 25569) * 86400000), d = new Date(ms), iso = d.toISOString();
  return Number.isInteger(n) ? iso.slice(0, 10) : iso.slice(0, 19).replace("T", " ");
}

/** Valeur du serveur (tout arrive en texte) → valeur de cellule. */
export function toCell(v: Scalar | undefined, type: string): string | number | boolean {
  if (v === null || v === undefined) return "";
  if (isNumericType(type) && typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  if (isBoolType(type)) return v === true || v === "true" || v === "t";
  if (isDateType(type) && typeof v === "string") return v.slice(0, /^timestamp/i.test(type) ? 19 : 10).replace("T", " ");
  return v;
}

/** Valeur de cellule → valeur à envoyer au serveur (vide = null). */
export function fromCell(c: unknown, type: string): Scalar {
  if (c === null || c === undefined || c === "") return null;
  if (typeof c === "number") {
    if (isDateType(type)) return serialToIso(c);
    return c;
  }
  if (typeof c === "boolean") return c;
  const s = String(c);
  return s.trim() === "" ? null : s;
}

/** Comparaison tolérante : « 19500 » (serveur) = 19500 (cellule). */
const same = (a: Scalar, b: Scalar, type: string) => {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (isNumericType(type)) return Number(a) === Number(b);
  return String(a) === String(b);
};

export type Sheet = { header: string[]; types: string[]; values: (string | number | boolean)[][]; versions: string[] };
export function buildSheet(t: DataTable, rows: DataRow[]): Sheet {
  const cols = columnsOf(t);
  return {
    header: cols.map((c) => c.name), types: cols.map((c) => c.type),
    values: rows.map((r) => cols.map((c) => toCell(r[c.name], c.type))),
    versions: rows.map((r) => String(r[VERSION_COL] ?? "1")),
  };
}

export type Change =
  | { kind: "insert"; line: number; values: Record<string, Scalar> }
  | { kind: "update"; line: number; key: string; expectedVersion: number; values: Record<string, Scalar> }
  | { kind: "delete"; key: string; expectedVersion: number };

/**
 * Compare la feuille actuelle à l'instantané pris au dernier chargement.
 * Identification d'une ligne : sa clé (colonne de clé primaire). Ligne sans clé → création (clé générée) ;
 * clé inconnue de l'instantané → création ; clé de l'instantané absente de la feuille → suppression (si demandée).
 */
export function diffSheet(t: DataTable, snapshot: Sheet, current: unknown[][], { withDeletes = false } = {}): { changes: Change[]; errors: string[] } {
  const cols = columnsOf(t), keyIdx = cols.findIndex((c) => c.name === t.primaryKey);
  const errors: string[] = [];
  if (keyIdx < 0) return { changes: [], errors: ["Colonne de clé introuvable dans la feuille."] };
  const snap = new Map<string, { row: (string | number | boolean)[]; version: number }>();
  snapshot.values.forEach((r, i) => snap.set(String(r[keyIdx]), { row: r, version: Number(snapshot.versions[i]) || 1 }));
  const seen = new Set<string>(), changes: Change[] = [];
  current.forEach((row, i) => {
    const line = i + 2; // ligne Excel (en-tête = 1)
    if (row.every((c) => c === "" || c === null || c === undefined)) return;
    const keyCell = row[keyIdx], key = keyCell === "" || keyCell == null ? "" : String(keyCell);
    const writable = cols.filter((c) => !c.readOnly);
    const all = (): Record<string, Scalar> => Object.fromEntries(writable.map((c) => [c.name, fromCell(row[cols.indexOf(c)], c.type)]));
    if (!key && !t.generatedPrimaryKey) { errors.push(`Ligne ${line} : la clé « ${t.primaryKey} » est vide.`); return; }
    if (key && seen.has(key)) { errors.push(`Ligne ${line} : la clé « ${key} » apparaît deux fois.`); return; }
    if (key) seen.add(key);
    const old = key ? snap.get(key) : undefined;
    if (!old) { changes.push({ kind: "insert", line, values: Object.fromEntries(Object.entries(all()).filter(([, v]) => v !== null)) }); return; }
    const diff: Record<string, Scalar> = {};
    for (const c of writable) {
      if (c.name === t.primaryKey) continue;
      const now = fromCell(row[cols.indexOf(c)], c.type), before = fromCell(old.row[cols.indexOf(c)], c.type);
      if (!same(before, now, c.type)) diff[c.name] = now;
    }
    if (Object.keys(diff).length) changes.push({ kind: "update", line, key, expectedVersion: old.version, values: diff });
  });
  if (withDeletes) snap.forEach((o, key) => { if (!seen.has(key)) changes.push({ kind: "delete", key, expectedVersion: o.version }); });
  return { changes, errors };
}

// ───────────── Synchronisation à double sens : fusion des changements du serveur avec la feuille ─────────────
export type Feed = { rows: DataRow[]; deleted: { key: string; version?: number | null }[] };
export type Cell = string | number | boolean;
/** Désaccord à résoudre par l'utilisateur. both = modifiée des deux côtés ; server-deleted = supprimée sur le serveur mais modifiée ici ;
 *  local-deleted = supprimée ici mais modifiée sur le serveur ; duplicate = même clé ajoutée des deux côtés avec des valeurs différentes. */
export type Conflict = { key: string; kind: "both" | "server-deleted" | "local-deleted" | "duplicate"; fields: { col: string; mine: Scalar; server: Scalar }[]; serverRow: DataRow | null };
export type MergeResult = { rows: Cell[][]; snapshot: Sheet; conflicts: Conflict[]; stats: { added: number; updated: number; removed: number; merged: number } };

/** Équivalent de findIndex (absent des anciens Excel). */
const indexOf = <T>(a: T[], f: (x: T) => boolean): number => { for (var i = 0; i < a.length; i++) if (f(a[i])) return i; return -1; };
const blank = (r: unknown[]) => r.every((c) => c === "" || c === null || c === undefined);
const cellsOf = (t: DataTable, r: DataRow): Cell[] => columnsOf(t).map((c) => toCell(r[c.name], c.type));
const versionOf = (r: DataRow) => String(r[VERSION_COL] ?? "1");

/**
 * Fusion à trois : « snapshot » = état du serveur à la dernière synchronisation, « current » = la feuille (avec les modifications locales),
 * « feed » = ce qui a changé sur le serveur depuis. Ce qui n'est modifié que d'un côté est appliqué automatiquement ; les modifications de
 * colonnes différentes d'une même ligne sont fusionnées ; seul un vrai désaccord (même colonne, valeurs différentes) devient un conflit.
 * Une ligne en conflit garde sa valeur locale et son ancienne version : un envoi accidentel serait refusé par le serveur, jamais écrasé.
 */
export function mergeFeed(t: DataTable, snapshot: Sheet, current: unknown[][], feed: Feed, { withDeletes = false } = {}): MergeResult {
  const cols = columnsOf(t), keyIdx = indexOf(cols, (c) => c.name === t.primaryKey);
  const out: Cell[][] = current.filter((r) => !blank(r)).map((r) => cols.map((_, i) => (r[i] === undefined ? "" : (r[i] as Cell))));
  const snap = new Map<string, { row: Cell[]; version: string }>();
  snapshot.values.forEach((r, i) => snap.set(String(r[keyIdx]), { row: r.slice(), version: snapshot.versions[i] ?? "1" }));
  const stats = { added: 0, updated: 0, removed: 0, merged: 0 }, conflicts: Conflict[] = [];
  const at = (key: string) => indexOf(out, (r) => String(r[keyIdx]) === key);
  const val = (row: Cell[], i: number): Scalar => fromCell(row[i], cols[i].type);
  const differs = (a: Cell[], b: Cell[]) => cols.map((_, i) => i).filter((i) => !same(val(a, i), val(b, i), cols[i].type));

  // dernière version de chaque ligne reçue
  const latest = new Map<string, DataRow>();
  feed.rows.forEach((r) => { const k = String(r[t.primaryKey]), o = latest.get(k); if (!o || Number(versionOf(r)) >= Number(versionOf(o))) latest.set(k, r); });

  latest.forEach((sr, key) => {
    const srv = cellsOf(t, sr), v = versionOf(sr), old = snap.get(key), li = at(key);
    if (old && Number(v) <= Number(old.version)) return; // déjà à jour
    if (!old) {
      if (li < 0) { out.push(srv); snap.set(key, { row: srv, version: v }); stats.added++; return; }
      const d = differs(out[li], srv);
      if (!d.length) { snap.set(key, { row: srv, version: v }); return; }
      conflicts.push({ key, kind: "duplicate", fields: d.map((i) => ({ col: cols[i].name, mine: val(out[li], i), server: val(srv, i) })), serverRow: sr }); return;
    }
    if (li < 0) {
      if (withDeletes) { conflicts.push({ key, kind: "local-deleted", fields: [], serverRow: sr }); return; }
      out.push(srv); snap.set(key, { row: srv, version: v }); stats.added++; return;
    }
    const mine = differs(out[li], old.row), theirs = differs(srv, old.row);
    if (!mine.length) { out[li] = srv; snap.set(key, { row: srv, version: v }); stats.updated++; return; }
    const clash = mine.filter((i) => theirs.indexOf(i) >= 0 && !same(val(out[li], i), val(srv, i), cols[i].type));
    const row = out[li].slice();
    theirs.forEach((i) => { if (mine.indexOf(i) < 0) row[i] = srv[i]; }); // colonnes modifiées seulement sur le serveur
    out[li] = row;
    if (!clash.length) { snap.set(key, { row: srv, version: v }); stats.merged++; return; }
    conflicts.push({ key, kind: "both", fields: clash.map((i) => ({ col: cols[i].name, mine: val(row, i), server: val(srv, i) })), serverRow: sr });
  });

  feed.deleted.forEach((d) => {
    const key = String(d.key), old = snap.get(key); if (!old || latest.has(key)) return;
    const li = at(key);
    if (li < 0) { snap.delete(key); return; }
    if (!differs(out[li], old.row).length) { out.splice(li, 1); snap.delete(key); stats.removed++; return; }
    conflicts.push({ key, kind: "server-deleted", fields: [], serverRow: null });
  });

  const keys: string[] = []; snap.forEach((_, k) => keys.push(k));
  return { rows: out, conflicts, stats, snapshot: { header: snapshot.header, types: snapshot.types, values: keys.map((k) => snap.get(k)!.row), versions: keys.map((k) => snap.get(k)!.version) } };
}

/** Applique le choix de l'utilisateur pour un conflit : « server » (garder la version du serveur) ou « mine » (garder la mienne, elle sera envoyée). */
export function resolveConflict(t: DataTable, state: { rows: Cell[][]; snapshot: Sheet }, c: Conflict, choice: "mine" | "server"): { rows: Cell[][]; snapshot: Sheet } {
  const cols = columnsOf(t), keyIdx = indexOf(cols, (x) => x.name === t.primaryKey);
  const rows = state.rows.map((r) => r.slice()), values = state.snapshot.values.map((r) => r.slice()), versions = state.snapshot.versions.slice();
  const at = indexOf(rows, (r) => String(r[keyIdx]) === c.key), si = indexOf(values, (r) => String(r[keyIdx]) === c.key);
  const srv = c.serverRow ? cellsOf(t, c.serverRow) : null, ver = c.serverRow ? versionOf(c.serverRow) : "";
  const setSnap = (row: Cell[], v: string) => { if (si >= 0) { values[si] = row; versions[si] = v; } else { values.push(row); versions.push(v); } };
  if (c.kind === "server-deleted") {
    if (choice === "server") { if (at >= 0) rows.splice(at, 1); }
    if (si >= 0) { values.splice(si, 1); versions.splice(si, 1); } // « garder la mienne » : la ligne sera recréée à l'envoi
  } else if (choice === "server" && srv) { if (at >= 0) rows[at] = srv; else rows.push(srv); setSnap(srv, ver); }
  else if (srv) setSnap(srv, ver); // « garder la mienne » : on repart de la version du serveur, la valeur locale sera envoyée
  return { rows, snapshot: { header: state.snapshot.header, types: state.snapshot.types, values, versions } };
}
