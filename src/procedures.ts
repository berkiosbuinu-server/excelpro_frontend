// Procédures : suites d'étapes exécutées par le serveur en une seule transaction (tout ou rien).
// Ce fichier ne contient que la logique pure (conversion formulaire ⇄ définition envoyée au serveur) : testable sans interface.

export type V = { k: "value" | "param" | "ref" | "calc"; text: string; op?: string; a?: V; b?: V };
export type PSet = { col: string; mode: "to" | "add"; v: V };
export type PStep = {
  type: "get" | "insert" | "update" | "delete" | "check" | "each";
  id: string; table: string; key: V; required: boolean; set: PSet[];
  left: V; cmp: string; right: V; message: string; over: string; steps: PStep[];
};
export type PParam = { name: string; type: "text" | "number" | "date" | "bool" | "list"; required: boolean; fields: string };
export type ProcedureDef = { description?: string; public?: boolean; params: { name: string; type: string; required?: boolean; fields?: string[] }[]; steps: unknown[]; returns?: string[] };

export const CMP: [string, string][] = [["eq", "est égal à"], ["ne", "est différent de"], ["gt", "est supérieur à"], ["gte", "est supérieur ou égal à"], ["lt", "est inférieur à"], ["lte", "est inférieur ou égal à"], ["isnull", "est vide"], ["notnull", "n'est pas vide"]];
export const CALC: [string, string][] = [["add", "+"], ["sub", "−"], ["mul", "×"], ["div", "÷"]];

export const vEmpty = (k: V["k"] = "value"): V => ({ k, text: "" });
export const stepEmpty = (type: PStep["type"] = "insert"): PStep => ({ type, id: "", table: "", key: vEmpty(), required: true, set: [], left: vEmpty(), cmp: "gte", right: vEmpty(), message: "", over: "", steps: [] });

const NUM = /^-?\d+(\.\d+)?$/;
const scalar = (t: string): string | number | null => (t.trim() === "" ? null : NUM.test(t.trim()) ? Number(t.trim()) : t);

export function vToDef(v: V): unknown {
  if (v.k === "param") return { param: v.text };
  if (v.k === "ref") return { ref: v.text };
  if (v.k === "calc") return { op: v.op || "add", args: [vToDef(v.a ?? vEmpty()), vToDef(v.b ?? vEmpty())] };
  return scalar(v.text);
}
export function vFromDef(d: unknown): V {
  if (d === null || d === undefined) return vEmpty();
  if (typeof d !== "object") return { k: "value", text: String(d) };
  const o = d as Record<string, unknown>;
  if ("value" in o) return { k: "value", text: o.value === null || o.value === undefined ? "" : String(o.value) };
  if ("param" in o) return { k: "param", text: String(o.param) };
  if ("ref" in o) return { k: "ref", text: String(o.ref) };
  if ("op" in o) { const a = (o.args as unknown[]) ?? []; return { k: "calc", text: "", op: String(o.op), a: vFromDef(a[0]), b: vFromDef(a[1]) }; }
  return vEmpty();
}

export function stepToDef(s: PStep): Record<string, unknown> {
  const id = s.id.trim() ? { id: s.id.trim() } : {};
  if (s.type === "check") return { type: "check", left: vToDef(s.left), op: s.cmp, ...(s.cmp === "isnull" || s.cmp === "notnull" ? {} : { right: vToDef(s.right) }), message: s.message.trim() };
  if (s.type === "each") return { type: "each", over: s.over, steps: s.steps.map(stepToDef) };
  const o: Record<string, unknown> = { type: s.type, ...id, table: s.table };
  if (s.type !== "insert") o.key = vToDef(s.key);
  if (s.type === "get" && !s.required) o.required = false;
  if (s.type === "insert" || s.type === "update") o.set = s.set.map((x) => (x.mode === "add" ? { col: x.col, add: vToDef(x.v) } : { col: x.col, to: vToDef(x.v) }));
  return o;
}
export function stepFromDef(d: unknown): PStep {
  const o = d as Record<string, unknown>, s = stepEmpty(o.type as PStep["type"]);
  s.id = typeof o.id === "string" ? o.id : ""; s.table = typeof o.table === "string" ? o.table : "";
  if (o.key !== undefined) s.key = vFromDef(o.key);
  s.required = o.required !== false;
  s.set = ((o.set as Record<string, unknown>[]) ?? []).map((x) => (x.add !== undefined ? { col: String(x.col), mode: "add" as const, v: vFromDef(x.add) } : { col: String(x.col), mode: "to" as const, v: vFromDef(x.to) }));
  if (o.type === "check") { s.left = vFromDef(o.left); s.cmp = String(o.op ?? "eq"); s.right = vFromDef(o.right); s.message = String(o.message ?? ""); }
  if (o.type === "each") { s.over = String(o.over ?? ""); s.steps = ((o.steps as unknown[]) ?? []).map(stepFromDef); }
  return s;
}

export function toProcedureDef(description: string, params: PParam[], steps: PStep[], returns: string[], isPublic = false): ProcedureDef {
  const def: ProcedureDef = {
    params: params.map((p) => ({ name: p.name.trim(), type: p.type, ...(p.required ? {} : { required: false }), ...(p.type === "list" ? { fields: p.fields.split(/[,\s;]+/).map((f) => f.trim()).filter(Boolean) } : {}) })),
    steps: steps.map(stepToDef),
  };
  if (description.trim()) def.description = description.trim();
  if (returns.length) def.returns = returns;
  if (isPublic) def.public = true;
  return def;
}
export function fromProcedureDef(d: ProcedureDef): { description: string; params: PParam[]; steps: PStep[]; returns: string[]; isPublic: boolean } {
  return {
    isPublic: d.public === true,
    description: d.description ?? "",
    params: (d.params ?? []).map((p) => ({ name: p.name, type: p.type as PParam["type"], required: p.required !== false, fields: (p.fields ?? []).join(", ") })),
    steps: (d.steps ?? []).map(stepFromDef), returns: d.returns ?? [],
  };
}

/** Identifiants d'étapes (get / insert / update) déclarés dans une liste, avec leur table : utilisables par les étapes suivantes. */
export const declaredIn = (steps: PStep[]): { id: string; table: string }[] => steps.filter((s) => s.id.trim() && (s.type === "get" || s.type === "insert" || s.type === "update")).map((s) => ({ id: s.id.trim(), table: s.table }));
