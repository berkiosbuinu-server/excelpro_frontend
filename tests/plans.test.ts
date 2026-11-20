import assert from "node:assert/strict";
import { EDITEUR_TIERS, perClient, planForTier, tierLabel, PLANS, annualPrice, annualPerMonth, fmtUsd, priceFor, perMonth, BILLING_MONTHS } from "../src/plans.ts";
assert.deepEqual(PLANS.map((p) => [p.monthly, annualPrice(p.monthly)]), [[3, 25], [15, 126], [39, 328], [30, 252]]);
for (const p of PLANS) assert.ok(annualPrice(p.monthly) <= p.monthly * 12 * 0.7 + 0.5 && annualPrice(p.monthly) < p.monthly * 12);
assert.equal(annualPerMonth(15), 10.5); assert.equal(fmtUsd(10.5), "10,50 $"); assert.equal(fmtUsd(3), "3 $");
assert.equal(new Set(PLANS.map((p) => p.id)).size, 4);
// promotion : 3 mois payés = 4 mois de service ; annuel = 12 mois à -30 %
assert.deepEqual(PLANS.map((p) => priceFor(p.monthly, "quarterly")), [9, 45, 117, 90]);
assert.equal(BILLING_MONTHS.quarterly, 4); assert.equal(perMonth(15, "quarterly"), 11.25); assert.equal(perMonth(15, "yearly"), 10.5); assert.equal(priceFor(15, "monthly"), 15);
// Éditeur : le prix suit le palier de clients, et chaque client coûte moins cher à mesure que le palier grandit
assert.deepEqual(EDITEUR_TIERS.map((t) => [t.id, t.clients, t.monthly]), [["editeur10", 10, 30], ["editeur50", 50, 89], ["editeur100", 100, 149], ["editeur500", 500, 299]]);
assert.deepEqual(EDITEUR_TIERS.map(perClient), [3, 1.78, 1.49, 0.6]);
assert.deepEqual(EDITEUR_TIERS.map((t, i) => tierLabel(t, i)), ["1 à 10 clients", "11 à 50 clients", "51 à 100 clients", "101 à 500 clients"]);
const ed = PLANS.find((p) => p.id === "editeur")!, pick = planForTier(ed, EDITEUR_TIERS[1]);
assert.equal(pick.id, "editeur50"); assert.equal(pick.monthly, 89); assert.equal(pick.name, "Éditeur · 11 à 50 clients"); assert.equal(pick.limits.rows, "1 000 000");
assert.equal(annualPrice(299), 2512); assert.equal(priceFor(30, "quarterly"), 90);
for (let i = 1; i < EDITEUR_TIERS.length; i++) assert.ok(EDITEUR_TIERS[i].monthly > EDITEUR_TIERS[i - 1].monthly && perClient(EDITEUR_TIERS[i]) < perClient(EDITEUR_TIERS[i - 1]));
console.log("plans OK");
import { monthlyOf, nextTier } from "../src/plans.ts";
assert.deepEqual(["solo", "equipe", "editeur", "editeur10", "editeur500", "x"].map(monthlyOf), [3, 15, 79, 30, 299, null]);
assert.equal(nextTier("editeur10")?.id, "editeur50"); assert.equal(nextTier("editeur500"), null); assert.equal(nextTier("equipe"), null);
console.log("plans (montée) OK");
