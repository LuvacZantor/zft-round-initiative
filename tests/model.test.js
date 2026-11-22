import test from "node:test";
import assert from "node:assert/strict";
import { createSnapshot, highest, initiativeValue, lockSnapshot, restorePlan, rowsFromCombat } from "../scripts/model.js";
import { fakeCombat } from "./helpers.js";

test("null is pending; zero and negative initiative are real rolls", () => {
  assert.equal(initiativeValue(null), null);
  assert.equal(initiativeValue(undefined), null);
  assert.equal(initiativeValue(0), 0);
  assert.equal(initiativeValue(-4), -4);
  assert.throws(() => initiativeValue("bad"));
});
test("highest uses the existing tracker order for ties and ignores unrolled", () => {
  const rows = [{ id: "pending", initiative: null }, { id: "first", initiative: 0 }, { id: "second", initiative: 0 }, { id: "negative", initiative: -1 }];
  assert.equal(highest(rows).id, "first");
  assert.equal(highest([{ initiative: null }]), null);
});
test("defeated filtering is explicit and defaults to the supplied macro", () => {
  const rows = [{ id: "dead", initiative: 20, defeated: true }, { id: "live", initiative: 10 }];
  assert.equal(highest(rows).id, "dead");
  assert.equal(highest(rows, false).id, "live");
});
test("the start snapshot is copied and cannot be overwritten", () => {
  const combat = fakeCombat();
  const original = createSnapshot(combat);
  const record = { combatId: combat.id, rounds: {} };
  const saved = lockSnapshot(record, original);
  original.rows[0].initiative = 999;
  assert.equal(saved.rounds[1].rows[0].initiative, 21);
  assert.deepEqual(record.rounds, {});
  assert.throws(() => lockSnapshot(saved, createSnapshot(combat)), /already/);
});
test("restore is ID-based for identical NPC names, skips removals and leaves newcomers", () => {
  const combat = fakeCombat();
  const snapshot = createSnapshot(combat);
  combat.combatants.splice(combat.combatants.findIndex(c => c.id === "d"), 1);
  combat.combatants.push({ id: "new", name: "Goblin", initiative: 30 });
  const plan = restorePlan(snapshot, combat);
  assert.deepEqual(plan.updates, [{ _id: "a", initiative: 21 }, { _id: "b", initiative: 16 }, { _id: "c", initiative: 8 }]);
  assert.deepEqual(plan.added, ["new"]);
  assert.deepEqual(plan.missing, ["Ally"]);
});
test("snapshots never cross encounter or round boundaries", () => {
  const combat = fakeCombat();
  const snapshot = createSnapshot(combat);
  combat.round = 2;
  assert.throws(() => restorePlan(snapshot, combat), /matching/);
  combat.round = 1;
  combat.id = "other";
  assert.throws(() => restorePlan(snapshot, combat), /matching/);
  assert.throws(() => restorePlan(undefined, combat), /matching/);
});
test("round zero cannot be captured and invalid saved values cannot be restored", () => {
  assert.throws(() => createSnapshot(fakeCombat({ round: 0 })), /Foundry/);
  const combat = fakeCombat();
  const snapshot = createSnapshot(combat);
  snapshot.rows[0].initiative = "invalid";
  assert.throws(() => restorePlan(snapshot, combat), /invalid/);
  assert.equal(rowsFromCombat(combat).length, 4);
});
