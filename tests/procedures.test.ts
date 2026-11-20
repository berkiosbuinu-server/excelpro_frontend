import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { vbaApp, routesOf, savedExample } from "../src/generate.ts";
import { fromProcedureDef, stepEmpty, toProcedureDef, vEmpty, declaredIn, type PParam, type PStep } from "../src/procedures.ts";
import type { DataTable, SavedItem } from "../src/dataops.ts";

// 1. Formulaire → définition → formulaire (aller-retour sans perte, y compris la forme normalisée du serveur)
const params: PParam[] = [{ name: "numero", type: "text", required: true, fields: "" }, { name: "lignes", type: "list", required: true, fields: "id, produit, qte" }];
const each: PStep = { ...stepEmpty("each"), over: "lignes", steps: [
  { ...stepEmpty("get"), id: "p", table: "produits", key: { k: "ref", text: "item.produit" } },
  { ...stepEmpty("check"), left: { k: "ref", text: "p.stock" }, cmp: "gte", right: { k: "ref", text: "item.qte" }, message: "Stock insuffisant" },
  { ...stepEmpty("update"), table: "produits", key: { k: "ref", text: "item.produit" }, set: [{ col: "stock", mode: "add", v: { k: "calc", text: "", op: "mul", a: { k: "ref", text: "item.qte" }, b: { k: "value", text: "-1" } } }] },
] };
const head: PStep = { ...stepEmpty("insert"), id: "f", table: "factures", set: [{ col: "numero", mode: "to", v: { k: "param", text: "numero" } }, { col: "total", mode: "to", v: { k: "value", text: "0" } }] };
const def = toProcedureDef(" Créer ", params, [head, each], ["f"]);
assert.deepEqual(def.params[1], { name: "lignes", type: "list", fields: ["id", "produit", "qte"] });
assert.deepEqual((def.steps[0] as { set: unknown[] }).set[1], { col: "total", to: 0 }); // nombre reconnu
assert.equal(def.description, "Créer"); assert.deepEqual(def.returns, ["f"]);
const back = fromProcedureDef(JSON.parse(JSON.stringify(def)));
assert.deepEqual(toProcedureDef(back.description, back.params, back.steps, back.returns), def);
// forme normalisée par le serveur ({ value: … })
const norm = fromProcedureDef({ params: [], steps: [{ type: "insert", table: "t", set: [{ col: "a", to: { value: 5 } }, { col: "b", to: { value: null } }] }] });
assert.deepEqual((norm.steps[0].set[0].v), { k: "value", text: "5" }); assert.equal(norm.steps[0].set[1].v.text, "");
assert.deepEqual(declaredIn([head, each]), [{ id: "f", table: "factures" }]);
assert.deepEqual(vEmpty("ref"), { k: "ref", text: "" });

// 2. Route, VBA et exemples générés
const tables = (JSON.parse(readFileSync(new URL("./schema.fixture.json", import.meta.url), "utf8")) as { tables: DataTable[] }).tables;
const item: SavedItem = { name: "creer-facture", kind: "procedure", def: def as never, valid: true, createdAt: "", updatedAt: "",
  params: [{ name: "numero", type: "text", required: true }, { name: "note", type: "text", required: false }, { name: "lignes", type: "list", required: true, fields: ["id", "produit", "qte"] }] };
const vba = vbaApp("https://s.test/admin/v1/excel-cloud/imports/abc/data", "bkk1.x", tables, [item]);
const lines = vba.split("\r\n");
assert.ok(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(vba), "ASCII uniquement"); assert.ok(lines.every((l) => l.length < 1000));
const sig = lines.findIndex((l) => l.includes("Public Function Procedure_CreerFacture"));
assert.ok(lines.slice(sig, sig + 3).join(" ").includes("ByVal lignes As Range"));
assert.ok(vba.includes('BK_List(lignes, "id|produit|qte")')); assert.ok(vba.includes("Private Function BK_List("));
assert.ok(vba.includes('Procedure_CreerFacture = BK_Request("POST", "~/act/creer-facture", bk_b)'));
assert.ok(vba.includes("If Not IsMissing(note) Then"));
const names = [...vba.matchAll(/^\s*(?:Public |Private )?(?:Sub|Function) (\w+)/gm)].map((m) => m[1].toLowerCase());
assert.equal(new Set(names).size, names.length);
assert.equal((vba.match(/^\s*(Public |Private )?Function /gm) || []).length, (vba.match(/^\s*End Function/gm) || []).length);
const r = routesOf(tables, [item]).find((x) => x.path === "/act/creer-facture");
assert.ok(r && /idempotencyKey/.test(r.body ?? "") && /\[ \{ "id"/.test(r.body ?? ""));
const curl = savedExample("curl", "https://s.test/x/data", item, "KEY");
assert.match(curl, /-X POST/); assert.match(curl, /"lignes":\[\{"id":"valeur"/);
assert.match(savedExample("js", "https://s.test/x/data", item, "K"), /method: "POST"/);
console.log("procedures: ok");

// 3. Procédure publique : l'indicateur est conservé, la route d'inscription et le VBA l'utilisent
{
  const pub = toProcedureDef("Inscription", [{ name: "nom", type: "text", required: true, fields: "" }], [{ ...stepEmpty("insert"), table: "factures", set: [{ col: "client", mode: "to", v: { k: "param", text: "nom" } }] }], [], true);
  assert.equal(pub.public, true); assert.equal(fromProcedureDef(JSON.parse(JSON.stringify(pub))).isPublic, true); assert.equal(toProcedureDef("", [], [], []).public, undefined);
  const it: SavedItem = { name: "inscription", kind: "procedure", def: pub as never, valid: true, createdAt: "", updatedAt: "", params: [{ name: "nom", type: "text", required: true }] };
  assert.ok(routesOf(tables, [it]).some((r) => r.path === "/signup/inscription" && /publique/.test(r.title)));
  assert.ok(vbaApp("https://s.test/admin/v1/excel-cloud/imports/abc/data", "bkk1.x", tables, [it]).includes('BK_Request("POST", "~/signup/inscription", bk_b)'));
  assert.match(savedExample("curl", "https://s.test/x/data", it, "K"), /\/signup\/inscription/);
}
console.log("procedures (publiques): ok");
