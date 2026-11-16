import assert from "node:assert/strict";
import { buildSheet, diffSheet, columnsOf, fromCell, toCell, serialToIso, type DataTable } from "../src/dataops.ts";
const t: DataTable = { table: "vente", primaryKey: "numero", generatedPrimaryKey: false, fields: [
  { name: "numero", type: "TEXT", nullable: false, secret: false }, { name: "date", type: "DATE", nullable: true, secret: false },
  { name: "total_ht", type: "NUMERIC(18,2)", nullable: true, secret: false }, { name: "pw", type: "TEXT", nullable: true, secret: true } ] };
const rows = [{ numero: "1", date: null, total_ht: "19500", _berkios_version: "1" }, { numero: "3", date: "2026-01-05", total_ht: "30000", _berkios_version: "4" }];
const s = buildSheet(t, rows);
assert.deepEqual(s.header, ["numero", "date", "total_ht"]); assert.deepEqual(s.values[0], ["1", "", 19500]); assert.equal(s.versions[1], "4");
assert.equal(serialToIso(46027), "2026-01-05"); assert.equal(fromCell(46027, "DATE"), "2026-01-05"); assert.equal(fromCell("", "TEXT"), null);
assert.equal(toCell("2026-01-05T00:00:00.000Z", "DATE"), "2026-01-05");
// aucun changement
assert.equal(diffSheet(t, s, s.values).changes.length, 0);
// modification + ajout + suppression
const cur = [["1", "", 20000], ["9", 46027, 5], ["", "", ""]];
const d = diffSheet(t, s, cur, { withDeletes: true });
assert.deepEqual(d.changes.map((c) => c.kind), ["update", "insert", "delete"]);
const up = d.changes[0] as any; assert.equal(up.key, "1"); assert.deepEqual(up.values, { total_ht: 20000 }); assert.equal(up.expectedVersion, 1);
assert.deepEqual((d.changes[1] as any).values, { numero: "9", date: "2026-01-05", total_ht: 5 });
assert.deepEqual(d.changes[2], { kind: "delete", key: "3", expectedVersion: 4 });
assert.equal(diffSheet(t, s, cur).changes.length, 2, "sans option : pas de suppression");
// doublon et clé vide
assert.equal(diffSheet(t, s, [["1","",1],["1","",2]]).errors.length, 1);
assert.equal(diffSheet(t, s, [["","",1]]).errors.length, 1);
// clé générée
const g: DataTable = { table: "x", primaryKey: "id", generatedPrimaryKey: true, fields: [{ name: "nom", type: "TEXT", nullable: true, secret: false }] };
assert.deepEqual(columnsOf(g).map((c) => c.name), ["id", "nom"]);
const gs = buildSheet(g, [{ id: "u1", nom: "A", _berkios_version: "2" }]);
const gd = diffSheet(g, gs, [["u1", "B"], ["", "C"]]);
assert.deepEqual(gd.changes.map((c) => c.kind), ["update", "insert"]); assert.deepEqual((gd.changes[1] as any).values, { nom: "C" });
console.log("dataops OK");
