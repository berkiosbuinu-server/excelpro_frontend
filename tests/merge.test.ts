import assert from "node:assert/strict";
import { mergeFeed, resolveConflict, VERSION_COL, buildSheet, diffSheet, type DataTable, type DataRow } from "../src/dataops.ts";

const t: DataTable = { table: "produits", primaryKey: "code", generatedPrimaryKey: false, fields: [{ name: "code", type: "TEXT", nullable: false, secret: false }, { name: "nom", type: "TEXT", nullable: false, secret: false }, { name: "stock", type: "NUMERIC", nullable: false, secret: false }, { name: "prix", type: "NUMERIC", nullable: false, secret: false }] };
const R = (code: string, nom: string, stock: number, prix: number, v: number): DataRow => ({ code, nom, stock: String(stock), prix: String(prix), [VERSION_COL]: String(v) });
const server = [R("P1", "Stylo", 10, 5, 1), R("P2", "Cahier", 3, 20, 1), R("P3", "Règle", 7, 1, 1)];
const snap = buildSheet(t, server);
const sheet = () => snap.values.map((r) => r.slice());
const find = (rows: unknown[][], k: string) => rows.find((r) => r[0] === k);

// 1. serveur seul modifié / ajouté / supprimé -> appliqué sans question
let m = mergeFeed(t, snap, sheet(), { rows: [R("P1", "Stylo", 8, 5, 2), R("P4", "Gomme", 2, 1, 1)], deleted: [{ key: "P3" }] });
assert.equal(m.conflicts.length, 0); assert.deepEqual(find(m.rows, "P1"), ["P1", "Stylo", 8, 5]); assert.ok(find(m.rows, "P4")); assert.equal(find(m.rows, "P3"), undefined);
assert.deepEqual(m.stats, { added: 1, updated: 1, removed: 1, merged: 0 });
assert.equal(m.snapshot.versions[m.snapshot.values.findIndex((r) => r[0] === "P1")], "2"); assert.equal(m.snapshot.values.length, 3);
// après fusion, il ne reste rien à envoyer
assert.equal(diffSheet(t, m.snapshot, m.rows, { withDeletes: true }).changes.length, 0);

// 2. modifications locales seules conservées et toujours à envoyer
let cur = sheet(); cur[1][2] = 99;
m = mergeFeed(t, snap, cur, { rows: [R("P1", "Stylo", 8, 5, 2)], deleted: [] });
assert.equal(m.conflicts.length, 0); assert.equal(find(m.rows, "P2")![2], 99);
let d = diffSheet(t, m.snapshot, m.rows); assert.equal(d.changes.length, 1); assert.equal((d.changes[0] as { key: string }).key, "P2");

// 3. même ligne, colonnes différentes -> fusion automatique, envoi avec la NOUVELLE version
cur = sheet(); cur[0][1] = "Stylo bleu";
m = mergeFeed(t, snap, cur, { rows: [R("P1", "Stylo", 8, 5, 2)], deleted: [] });
assert.equal(m.conflicts.length, 0); assert.deepEqual(find(m.rows, "P1"), ["P1", "Stylo bleu", 8, 5]); assert.equal(m.stats.merged, 1);
d = diffSheet(t, m.snapshot, m.rows); assert.equal(d.changes.length, 1);
assert.deepEqual(d.changes[0], { kind: "update", line: 2, key: "P1", expectedVersion: 2, values: { nom: "Stylo bleu" } });

// 4. même colonne, valeurs différentes -> conflit ; la valeur locale et l'ancienne version sont conservées
cur = sheet(); cur[0][2] = 50;
m = mergeFeed(t, snap, cur, { rows: [R("P1", "Stylo", 8, 5, 2)], deleted: [] });
assert.equal(m.conflicts.length, 1); assert.equal(m.conflicts[0].kind, "both"); assert.equal(m.conflicts[0].fields[0].col, "stock"); assert.equal(m.conflicts[0].fields[0].mine, 50); assert.equal(Number(m.conflicts[0].fields[0].server), 8);
assert.equal(find(m.rows, "P1")![2], 50); assert.equal(m.snapshot.versions[0], "1");
// 4a. garder le serveur
let r = resolveConflict(t, m, m.conflicts[0], "server"); assert.equal(find(r.rows, "P1")![2], 8); assert.equal(diffSheet(t, r.snapshot, r.rows).changes.length, 0);
// 4b. garder la mienne : la valeur locale sera envoyée contre la version du serveur
r = resolveConflict(t, m, m.conflicts[0], "mine"); d = diffSheet(t, r.snapshot, r.rows);
assert.deepEqual(d.changes, [{ kind: "update", line: 2, key: "P1", expectedVersion: 2, values: { stock: 50 } }]);
// deux côtés d'accord sur la même valeur : pas de conflit
cur = sheet(); cur[0][2] = 8; m = mergeFeed(t, snap, cur, { rows: [R("P1", "Stylo", 8, 5, 2)], deleted: [] }); assert.equal(m.conflicts.length, 0);

// 5. supprimée sur le serveur, modifiée ici -> conflit ; supprimée des deux côtés -> rien
cur = sheet(); cur[2][2] = 70;
m = mergeFeed(t, snap, cur, { rows: [], deleted: [{ key: "P3" }] }); assert.equal(m.conflicts[0].kind, "server-deleted"); assert.ok(find(m.rows, "P3"));
r = resolveConflict(t, m, m.conflicts[0], "server"); assert.equal(find(r.rows, "P3"), undefined); assert.equal(r.snapshot.values.length, 2);
r = resolveConflict(t, m, m.conflicts[0], "mine"); d = diffSheet(t, r.snapshot, r.rows); assert.equal(d.changes.length, 1); assert.equal(d.changes[0].kind, "insert");
cur = sheet().filter((x) => x[0] !== "P3"); m = mergeFeed(t, snap, cur, { rows: [], deleted: [{ key: "P3" }] }); assert.equal(m.conflicts.length, 0); assert.equal(m.snapshot.values.length, 2);

// 6. supprimée ici (suppressions activées), modifiée sur le serveur -> conflit ; sans l'option, la ligne revient
cur = sheet().filter((x) => x[0] !== "P1");
m = mergeFeed(t, snap, cur, { rows: [R("P1", "Stylo", 8, 5, 2)], deleted: [] }, { withDeletes: true });
assert.equal(m.conflicts[0].kind, "local-deleted"); assert.equal(find(m.rows, "P1"), undefined);
r = resolveConflict(t, m, m.conflicts[0], "server"); assert.deepEqual(find(r.rows, "P1"), ["P1", "Stylo", 8, 5]);
r = resolveConflict(t, m, m.conflicts[0], "mine"); d = diffSheet(t, r.snapshot, r.rows, { withDeletes: true }); assert.deepEqual(d.changes, [{ kind: "delete", key: "P1", expectedVersion: 2 }]);
m = mergeFeed(t, snap, cur, { rows: [R("P1", "Stylo", 8, 5, 2)], deleted: [] }); assert.equal(m.conflicts.length, 0); assert.ok(find(m.rows, "P1"));

// 7. ajout local d'une clé que le serveur a aussi créée
cur = [...sheet(), ["P9", "Local", 1, 1]];
m = mergeFeed(t, snap, cur, { rows: [R("P9", "Serveur", 1, 1, 1)], deleted: [] }); assert.equal(m.conflicts[0].kind, "duplicate");
m = mergeFeed(t, snap, cur, { rows: [R("P9", "Local", 1, 1, 1)], deleted: [] }); assert.equal(m.conflicts.length, 0); assert.equal(m.snapshot.values.length, 4);

// 8. rejouer deux fois le même flux (fenêtre de sécurité du serveur) ne change rien ; ligne locale sans clé conservée
const feed = { rows: [R("P1", "Stylo", 8, 5, 2)], deleted: [] };
m = mergeFeed(t, snap, sheet(), feed); const m2 = mergeFeed(t, m.snapshot, m.rows, feed);
assert.deepEqual(m2.rows, m.rows); assert.deepEqual(m2.stats, { added: 0, updated: 0, removed: 0, merged: 0 });
assert.equal(mergeFeed(t, snap, [...sheet(), ["", "", "", ""]], { rows: [], deleted: [] }).rows.length, 3);
console.log("merge OK");
