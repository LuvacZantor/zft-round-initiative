import test from "node:test";
import assert from "node:assert/strict";
import { setup, fakeCombat } from "./helpers.js";
import { RoundService } from "../scripts/service.js";
import { HistoryStore } from "../scripts/store.js";

test("make current three turns into a protected round writes only turn and retains all starting values/history", async () => {
  const { combat } = setup();
  const store = new HistoryStore();
  const service = new RoundService(store, { confirm: async () => true });
  await service.begin();
  combat.turn = 3;
  const saved = structuredClone(store.read(combat));
  const initiatives = combat.combatants.map(c => [c.id, c.initiative]);
  combat.writes = [];
  assert.equal(await service.setCurrent(combat.id, "b"), true);
  assert.equal(combat.combatant.id, "b");
  assert.equal(combat.round, 1);
  assert.deepEqual(combat.writes, [{ kind: "combat", changes: { turn: 1 } }]);
  assert.deepEqual(combat.combatants.map(c => [c.id, c.initiative]), initiatives);
  assert.deepEqual(store.read(combat), saved);
});

test("make current re-resolves sorted index by combatant ID and distinguishes identical NPC names", async () => {
  const { combat } = setup();
  const service = new RoundService(new HistoryStore());
  combat.combatants.get("c").initiative = 30;
  await service.setCurrent(combat.id, "b");
  assert.equal(combat.turn, 2);
  assert.equal(combat.combatant.id, "b");
  await service.setCurrent(combat.id, "c");
  assert.equal(combat.turn, 0);
  assert.equal(combat.combatant.id, "c");
  assert.equal(game.journal.length, 0);
});

test("already current is a no-op, and missing/unstarted combatants never write an invalid turn", async () => {
  const { combat } = setup();
  const service = new RoundService(new HistoryStore());
  assert.equal(await service.setCurrent(combat.id, "a"), false);
  await assert.rejects(service.setCurrent(combat.id, "removed"), /no longer/);
  combat.round = 0;
  await assert.rejects(service.setCurrent(combat.id, "b"), /Start combat/);
  assert.equal(combat.writes.length, 0);
});

test("make current enforces active GM and shares the action lock with initiative recovery", async () => {
  const { combat } = setup();
  const service = new RoundService(new HistoryStore());
  game.user.isActiveGM = false;
  await assert.rejects(service.setCurrent(combat.id, "b"), /active GM/);
  game.user.isGM = false;
  game.user.isActiveGM = true;
  await assert.rejects(service.setCurrent(combat.id, "b"), /active GM/);
  game.user.isGM = true;
  let finish;
  const originalUpdate = combat.update.bind(combat);
  combat.update = changes => new Promise(resolve => { finish = () => resolve(originalUpdate(changes)); });
  const first = service.setCurrent(combat.id, "b");
  await assert.rejects(service.setCurrent(combat.id, "c"), /already running/);
  await assert.rejects(service.restore(combat.id), /already running/);
  finish(); await first;
  assert.equal(service.busy, false);
  assert.equal(combat.combatant.id, "b");
  assert.equal(combat.writes.length, 1);
});

test("a failed pointer write releases the lock and leaves protected records usable for retry", async () => {
  const { combat } = setup();
  const store = new HistoryStore();
  const service = new RoundService(store, { confirm: async () => true });
  await service.begin();
  const saved = structuredClone(store.read(combat));
  const original = combat.update.bind(combat);
  combat.update = async () => { throw new Error("write failed"); };
  await assert.rejects(service.setCurrent(combat.id, "c"), /write failed/);
  assert.equal(service.busy, false);
  assert.deepEqual(store.read(combat), saved);
  combat.update = original;
  await service.setCurrent(combat.id, "c");
  assert.equal(combat.combatant.id, "c");
});

test("explicit encounter targeting never changes a different active encounter", async () => {
  const { combat } = setup();
  const other = fakeCombat({ id: "combat-other", round: 4 });
  game.combats.push(other);
  const service = new RoundService(new HistoryStore());
  await service.setCurrent(other.id, "c");
  assert.equal(other.combatant.id, "c");
  assert.equal(other.round, 4);
  assert.equal(combat.writes.length, 0);
  assert.equal(game.combat, combat);
});

test("recovery after a manual pointer correction retains the newly selected combatant", async () => {
  const { combat } = setup();
  const service = new RoundService(new HistoryStore(), { confirm: async () => true });
  await service.begin();
  await combat.updateEmbeddedDocuments("Combatant", combat.combatants.map(c => ({ _id: c.id, initiative: null })));
  await service.setCurrent(combat.id, "c");
  await service.restore(combat.id);
  assert.equal(combat.combatant.id, "c");
  assert.deepEqual(Array.from(combat.combatants, c => c.initiative), [21, 16, 8, 4]);
});
