import assert from "node:assert/strict";
import { PLANS, annualPrice, annualPerMonth, fmtUsd, priceFor, perMonth, BILLING_MONTHS } from "../src/plans.ts";
assert.deepEqual(PLANS.map((p) => [p.monthly, annualPrice(p.monthly)]), [[3, 25], [15, 126], [39, 328], [79, 664]]);
for (const p of PLANS) assert.ok(annualPrice(p.monthly) <= p.monthly * 12 * 0.7 + 0.5 && annualPrice(p.monthly) < p.monthly * 12);
assert.equal(annualPerMonth(15), 10.5); assert.equal(fmtUsd(10.5), "10,50 $"); assert.equal(fmtUsd(3), "3 $");
assert.equal(new Set(PLANS.map((p) => p.id)).size, 4);
// promotion : 3 mois payés = 4 mois de service ; annuel = 12 mois à -30 %
assert.deepEqual(PLANS.map((p) => priceFor(p.monthly, "quarterly")), [9, 45, 117, 237]);
assert.equal(BILLING_MONTHS.quarterly, 4); assert.equal(perMonth(15, "quarterly"), 11.25); assert.equal(perMonth(15, "yearly"), 10.5); assert.equal(priceFor(15, "monthly"), 15);
console.log("plans OK");
