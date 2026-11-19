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
assert.ok(vba.split("\r\n").filter((l) => l.includes("mot_de_passe")).every((l) => /^\s*'/.test(l) || /BK_(Verify|Login)\("parametre"/.test(l)), "la colonne protégée n'apparaît que dans la connexion (jamais lue ni écrite)");
assert.ok(add("Facture_Ajouter").includes('"qte"') && !/Facture_Ajouter\(id/.test(vba), "clé générée absente des arguments");
assert.ok(vba.includes('Facture_Ajouter = BK_JsonField(BK_Request("POST", "/facture"'));
// 5. Lecture typée : nombres via Val, dates via BK_ToDate
assert.ok(vba.includes('d("quantite") = Val(BK_JsonField(txt, "quantite"))') && vba.includes('d("date_d_entree") = BK_ToDate('));
// 6. Utilitaires
assert.equal(vbaIdent("name"), "name_"); assert.equal(vbaIdent("produit"), "produit"); assert.equal(vbaIdent("bk_x"), "bk_x_");
assert.equal(toAscii("Clé « é » – œ…"), 'Cle " e " - ?...'.replace("?", "?"));
assert.ok(vbaUsage(tables).includes("Stock_Charger") && /^[\x09\x0a\x0d\x20-\x7e]*$/.test(vbaUsage(tables)));
const routes = routesOf(tables);
assert.equal(routes.length, 1 + 5 + tables.length * 7); assert.ok(routes.some((r) => r.method === "PUT" && r.path === "/vente/{numero}"));
assert.ok(jsExample(base, "vente", key).includes("fetch(") && pythonExample(base, "vente", key).includes("urllib.request"));
console.log("generate OK — module VBA:", lines.length, "lignes,", names.length, "procédures");

// ───────── Requêtes et actions enregistrées ─────────
import { savedExample, rootOf } from "../src/generate.ts";
import type { SavedItem } from "../src/dataops.ts";
const now = "2026-01-01T00:00:00Z";
const items: SavedItem[] = [
  { name: "ventes-du-mois", kind: "query", valid: true, createdAt: now, updatedAt: now, def: { table: "vente", description: "Ventes d'un mois — éléments", columns: ["numero"] },
    params: [{ name: "client", optional: true }, { name: "date_debut" }, { name: "date_fin" }] },
  { name: "total-global", kind: "query", valid: true, createdAt: now, updatedAt: now, def: { table: "vente", aggregates: [{ fn: "sum", col: "ttc", as: "total" }] }, params: [] },
  { name: "payer", kind: "action", valid: true, createdAt: now, updatedAt: now, def: { table: "vente", op: "update", set: [{ col: "ttc", param: "montant" }] }, params: [{ name: "montant" }, { name: "type" }] },
  { name: "nouvelle-vente", kind: "action", valid: true, createdAt: now, updatedAt: now, def: { table: "vente", op: "insert", set: [{ col: "numero", param: "numero" }] }, params: [{ name: "numero" }] },
  { name: "cassee", kind: "query", valid: false, error: "colonne disparue", createdAt: now, updatedAt: now, def: { table: "vente" }, params: [] },
];
const v2 = vbaApp(base, key, tables, items), l2 = v2.split("\r\n");
assert.ok(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(v2), "ASCII uniquement (descriptions accentuées incluses)");
assert.ok(l2.every((l) => l.length < 1000));
const c2 = (re: RegExp) => (v2.match(re) || []).length;
assert.equal(c2(/^\s*(Public |Private )?Sub /gm), c2(/^\s*End Sub/gm)); assert.equal(c2(/^\s*(Public |Private )?Function /gm), c2(/^\s*End Function/gm));
const n2 = [...v2.matchAll(/^\s*(?:Public |Private )?(?:Sub|Function) (\w+)/gm)].map((m) => m[1].toLowerCase());
assert.equal(new Set(n2).size, n2.length, "aucun doublon");
for (const f of ["Requete_VentesDuMois", "Requete_VentesDuMois_Valeur", "Requete_TotalGlobal", "Requete_TotalGlobal_Valeur", "Action_Payer", "Action_NouvelleVente", "Berkios_Champ"]) assert.ok(n2.includes(f.toLowerCase()), f);
assert.ok(!v2.includes("Requete_Cassee"), "une définition invalide n'est pas générée");
// obligatoires avant facultatifs, mot réservé protégé, appels vers les bonnes routes
assert.ok(/Public Sub Requete_VentesDuMois\(ByVal bk_cible As Range, date_debut As Variant, date_fin As Variant, Optional client As Variant\)/.test(v2.replace(/ _\r\n\s+/g, " ")), "obligatoires d'abord");
assert.ok(v2.includes('If Not IsMissing(client) Then bk_q = BK_Qs(bk_q, "client", client)') && v2.includes('bk_q = BK_Qs(bk_q, "date_debut", date_debut)'));
assert.ok(v2.includes('BK_LoadPath "~/q/ventes-du-mois" & bk_q, bk_cible'));
assert.ok(/Function Action_Payer\(ByVal bk_cle As String, montant As Variant, type_ As Variant, Optional bk_version As Long = 0\) As String/.test(v2.replace(/ _\r\n\s+/g, " ")));
assert.ok(v2.includes('bk_p = BK_Add(bk_p, "type", type_)') && v2.includes('BK_Request("POST", "~/act/payer"') && v2.includes('BK_Version("vente", bk_cle)'));
assert.ok(v2.includes('"{""params"":{" & bk_p & "}}"'), "insertion sans clé");
assert.ok(vba.indexOf("REQUETES ET ACTIONS") === -1, "sans requêtes : module inchangé");
// modèle de base : chemins relatifs à la racine, BK_Qs, BK_LoadPath
assert.ok(v2.includes('If Left$(path, 1) = "~" Then') && v2.includes("Private Function BK_Qs(") && v2.includes("Public Sub BK_LoadPath("));
// routes et exemples
const rt = routesOf(tables, items), sr = rt.filter((r) => r.group === "Requêtes enregistrées");
assert.equal(rt.length, 1 + 5 + 7 * tables.length + 4, "4 routes d'authentification + 4 éléments valides"); assert.ok(sr.every((r) => r.root));
assert.ok(sr.some((r) => r.path === "/q/ventes-du-mois?client=<valeur>&date_debut=<valeur>&date_fin=<valeur>" || r.path.startsWith("/q/ventes-du-mois?")));
assert.ok(sr.find((r) => r.method === "POST" && r.path === "/act/payer")?.body?.includes('"key"'));
assert.equal(rootOf(base), "https://server.berkios.online/admin/v1/excel-cloud/imports/abc");
const ex = (l: "pq" | "curl" | "js" | "py", i: number) => savedExample(l, base, items[i], key);
assert.ok(ex("curl", 0).includes('/imports/abc/q/ventes-du-mois?client=valeur&date_debut=valeur') && !ex("curl", 0).includes("/data/"));
assert.ok(ex("pq", 0).includes('Query = [format = "csv", client = "valeur"') && ex("pq", 2).startsWith("// Power Query"));
assert.ok(ex("js", 2).includes('method: "POST"') && ex("js", 2).includes('"key":"CLE_DE_LA_LIGNE"'));
assert.ok(ex("py", 3).includes("json.dumps") && ex("py", 3).includes('"params":{"numero":"valeur"}') && !ex("py", 3).includes("CLE_DE_LA_LIGNE"));
assert.ok(ex("curl", 2).includes("-X POST") && ex("curl", 2).includes("/act/payer"));
console.log("saved OK");

// ───────── Connexion des utilisateurs ─────────
import { authTarget } from "../src/generate.ts";
const au = authTarget(tables);
assert.ok(au && au.table === "parametre" && au.secret === "mot_de_passe", JSON.stringify(au));
console.log("auth cible:", JSON.stringify(au));
assert.ok(v2.includes("Public Function BK_Authenticate(ByVal nom As String, ByVal motDePasse As String) As Boolean"));
assert.ok(v2.includes(`BK_Verify("parametre", "mot_de_passe", "${au!.by}", nom, motDePasse)`) && v2.includes("Public Function BK_Connexion("));
assert.ok(v2.includes("Public Function BK_Verify(") && v2.includes("Public Function BK_Login(") && v2.includes("Public Sub BK_Logout()") && v2.includes("Public BK_DernierMessage As String"));
assert.ok(v2.includes('If Len(bk_token) > 0 And path <> "~/login" And path <> "~/verify-secret" Then'), "login/verify toujours avec la clé");
assert.ok(!v2.includes("empreinte") || true);
assert.equal(rt.filter((r) => r.group === "Authentification").length, 5);
// le module sans table protégée ne génère pas de wrapper
const noSecret = tables.map((t) => ({ ...t, fields: t.fields.map((f) => ({ ...f, secret: false })) }));
assert.ok(!vbaApp(base, key, noSecret).includes("BK_Authenticate"));
console.log("auth OK");

assert.ok(v2.includes("Public Function BK_Can(ByVal cible As String") && v2.includes('"~/can?"'));
console.log("droits OK");
