import assert from "node:assert/strict";
import { PLANS, annualPrice, annualPerMonth, fmtUsd } from "../src/plans.ts";
assert.deepEqual(PLANS.map((p) => [p.monthly, annualPrice(p.monthly)]), [[3, 25], [15, 126], [39, 328], [79, 664]]);
for (const p of PLANS) assert.ok(annualPrice(p.monthly) <= p.monthly * 12 * 0.7 + 0.5 && annualPrice(p.monthly) < p.monthly * 12);
assert.equal(annualPerMonth(15), 10.5); assert.equal(fmtUsd(10.5), "10,50 $"); assert.equal(fmtUsd(3), "3 $");
assert.equal(new Set(PLANS.map((p) => p.id)).size, 4);
console.log("plans OK");
