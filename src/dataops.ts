// Logique pure (sans réseau ni Office) partagée par la page Hosting et l'add-in Excel :
// conversion des valeurs, construction d'une feuille à partir des lignes du serveur, et calcul des changements à renvoyer.
export type Scalar = string | number | boolean | null;
export type DataField = { name: string; type: string; nullable: boolean; secret: boolean };
export type DataTable = { table: string; primaryKey: string; generatedPrimaryKey: boolean; fields: DataField[] };
export type DataRow = Record<string, Scalar>;

/** Requêtes et actions enregistrées sur le serveur (routes personnalisées d'un classeur). */
export type SavedValue = string | number | boolean | null;
export type SavedParam = { name: string; optional?: boolean; col?: string; op?: string };
export type SavedDef = {
  table: string; description?: string; op?: "update" | "insert";
  columns?: string[]; groupBy?: string[]; aggregates?: { fn: string; col?: string; as?: string }[];
  filters?: { col: string; op: string; value?: SavedValue; param?: string; optional?: boolean }[];
  orderBy?: string; direction?: "asc" | "desc"; limit?: number;
  set?: { col: string; value?: SavedValue; param?: string }[];
};
export type SavedItem = { name: string; kind: "query" | "action"; def: SavedDef; params: SavedParam[]; valid: boolean; error?: string; createdAt: string; updatedAt: string };

/** Droits par rôle d'un classeur (appliqués aux utilisateurs connectés). */
export type RowRule = { col: string; value: string }; // value : « $user » (identifiant de connexion), « $user.colonne » (fiche de l'utilisateur) ou une valeur fixe
export type RoleRights = { tables: Record<string, string[]>; queries: string[]; actions: string[]; rows?: Record<string, RowRule> };
export type RoleSource = { table: string; match: string; column: string };
export type Policy = { roleColumn?: string; roleSource?: RoleSource; roles: Record<string, RoleRights> };

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
