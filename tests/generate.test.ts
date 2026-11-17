import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { vbaApp, vbaUsage, routesOf, vbaIdent, toAscii, jsExample, pythonExample } from "../src/generate.ts";
import type { DataTable } from "../src/dataops.ts";

// Schéma réel d'un classeur hébergé (stock, vente, facture à 32 colonnes avec clé générée, parametre avec colonne protégée)
const tables = (JSON.parse(readFileSync(new URL("./schema.fixture.json", import.meta.url), "utf8")) as { tables: DataTable[] }).tables;
const base = "https://server.berkios.online/admin/v1/excel-cloud/imports/abc/data", key = "bkk1.deadbeef." + "A".repeat(43);
const vba = vbaApp(base, key, tables);
const lines = vba.split("\r\n");

// 1. Compatibilité de l'éditeur VBA : ASCII seul, CRLF, limites de longueur et de continuations
assert.ok(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(vba), "ASCII uniquement");
assert.ok(vba.startsWith('Attribute VB_Name = "BerkiosApi"'));
assert.ok(lines.every((l) => l.length < 1000), "aucune ligne >= 1000 caractères");
let run = 0, maxRun = 0; for (const l of lines) { run = l.trimEnd().endsWith(" _") ? run + 1 : 0; maxRun = Math.max(maxRun, run); }
assert.ok(maxRun <= 23, `continuations par instruction: ${maxRun}`);
// 2. Structure équilibrée, noms de procédures uniques
const count = (re: RegExp) => (vba.match(re) || []).length;
assert.equal(count(/^\s*(Public |Private )?Sub /gm), count(/^\s*End Sub/gm));
assert.equal(count(/^\s*(Public |Private )?Function /gm), count(/^\s*End Function/gm));
const names = [...vba.matchAll(/^\s*(?:Public |Private )?(?:Sub|Function) (\w+)/gm)].map((m) => m[1].toLowerCase());
assert.equal(new Set(names).size, names.length, "pas de procédure en double");
// 3. Fonctions typées attendues pour chaque table
for (const t of tables) { const P = t.table[0].toUpperCase() + t.table.slice(1); for (const f of ["Charger", "Ajouter", "Modifier", "Supprimer", "Lire", "Chercher"]) assert.ok(names.includes(`${P}_${f}`.toLowerCase()), `${P}_${f}`); }
assert.ok(vba.includes("Public Sub Berkios_ChargerTout()") && vba.includes('BK_LoadInSheet "facture"'));
// 4. Arguments : clé obligatoire en premier ; mots réservés protégés ; colonne protégée jamais exposée
const add = (name: string) => vba.slice(vba.indexOf(`Public Function ${name}(`), vba.indexOf(`End Function`, vba.indexOf(`Public Function ${name}(`)));
assert.ok(/Public Function Vente_Ajouter\(numero As Variant, Optional /.test(vba), "clé obligatoire en tête");
assert.ok(vba.includes("Optional type_ As Variant") && vba.includes('"type", type_'), "type réservé -> type_");
assert.ok(vba.includes("Optional date_ As Variant"), "date réservé -> date_");
assert.ok(!vba.includes("mot_de_passe"), "la colonne protégée n'apparaît nulle part");
assert.ok(add("Facture_Ajouter").includes('"qte"') && !/Facture_Ajouter\(id/.test(vba), "clé générée absente des arguments");
assert.ok(vba.includes('Facture_Ajouter = BK_JsonField(BK_Request("POST", "/facture"'));
// 5. Lecture typée : nombres via Val, dates via BK_ToDate
assert.ok(vba.includes('d("quantite") = Val(BK_JsonField(txt, "quantite"))') && vba.includes('d("date_d_entree") = BK_ToDate('));
// 6. Utilitaires
assert.equal(vbaIdent("name"), "name_"); assert.equal(vbaIdent("produit"), "produit"); assert.equal(vbaIdent("bk_x"), "bk_x_");
assert.equal(toAscii("Clé « é » – œ…"), 'Cle " e " - ?...'.replace("?", "?"));
assert.ok(vbaUsage(tables).includes("Stock_Charger") && /^[\x09\x0a\x0d\x20-\x7e]*$/.test(vbaUsage(tables)));
const routes = routesOf(tables);
assert.equal(routes.length, 1 + tables.length * 6); assert.ok(routes.some((r) => r.method === "PUT" && r.path === "/vente/{numero}"));
assert.ok(jsExample(base, "vente", key).includes("fetch(") && pythonExample(base, "vente", key).includes("urllib.request"));
console.log("generate OK — module VBA:", lines.length, "lignes,", names.length, "procédures");
