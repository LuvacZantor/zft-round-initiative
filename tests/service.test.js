import test from "node:test";
import assert from "node:assert/strict";
import { HistoryStore } from "../scripts/store.js";
import { RoundService } from "../scripts/service.js";
import { ID } from "../scripts/constants.js";
import { fakeCombat, setup } from "./helpers.js";

function service(options = {}) { return new RoundService(new HistoryStore(), { confirm: async () => true, announce: async () => {}, ...options }); }

test("three turns into a round: restore its original rolls and retain the current combatant", async () => {
  const { combat } = setup();
  const svc = service();
  await svc.begin();
  const original = structuredClone(svc.store.read(combat).rounds[1]);
  combat.turn = 2;
  // Accidentally clearing initiative changes the sorted actor at this index.
  await combat.updateEmbeddedDocuments("Combatant", combat.combatants.map(c => ({ _id: c.id, initiative: null })));
  // GM can pick the intended current combatant, as requested by the owner.
  combat.turn = combat.turns.findIndex(c => c.id === "c");
  const beforeId = combat.combatant.id;
  await svc.restore();
  assert.equal(combat.combatant.id, beforeId);
  assert.deepEqual(combat.turns.map(c => c.initiative), [21, 16, 8, 4]);
  assert.equal(combat.round, 1);
  assert.deepEqual(svc.store.read(combat).rounds[1], original);
});

test("recovery survives a new service instance/browser session", async () => {
  const { combat } = setup();
  await service().begin();
  combat.combatants.forEach(c => { c.initiative = 2; });
  await service().restore();
  assert.equal(combat.combatants.get("a").initiative, 21);
});

test("a repeated Begin or Request cannot overwrite/reset the protected current round", async () => {
  const { combat } = setup();
  const svc = service();
  await svc.begin();
  const writes = combat.writes.length;
  await assert.rejects(svc.begin(), /protected/);
  await assert.rejects(svc.prepare(), /already protected/);
  assert.equal(combat.writes.length, writes);
});

test("GM preparation clears active-player initiative and natively rolls NPC/offline-owner combatants", async () => {
  const { combat } = setup();
  const svc = service();
  combat.turn = 2;
  const id = combat.combatant.id;
  await svc.prepare();
  assert.equal(combat.combatants.get("a").initiative, null);
  const roll = combat.writes.find(w => w.kind === "roll");
  assert.deepEqual(roll.ids, ["b", "c", "d"]);
  assert.deepEqual(roll.options, { formula: null, messageOptions: {}, updateTurn: true });
  assert.equal(combat.combatant.id, id);
  assert.equal(combat.round, 1);
  await assert.rejects(svc.prepare(), /already being collected/);
});

test("native round advancement preserves separate Round 1 and Round 2 baselines", async () => {
  const { combat } = setup();
  const svc = service();
  await svc.begin();
  const first = structuredClone(svc.store.read(combat).rounds[1]);
  await svc.endRound();
  assert.equal(combat.round, 1);
  combat.round = 2; // Only Foundry/GM does this.
  await svc.prepare();
  combat.combatants.get("a").initiative = 25;
  await svc.begin();
  assert.deepEqual(svc.store.read(combat).rounds[1], first);
  assert.equal(svc.store.read(combat).rounds[2].rows[0].initiative, 25);
  assert.equal(combat.round, 2);
  assert(combat.writes.filter(w => w.kind === "combat").every(w => Object.keys(w.changes).every(k => k === "turn")));
});

test("round zero preparation is allowed; Begin waits for native Start Combat", async () => {
  const { combat } = setup(fakeCombat({ round: 0 }));
  const svc = service();
  await svc.prepare();
  await assert.rejects(svc.begin(), /Start combat/);
  combat.round = 1;
  combat.combatants.get("a").initiative = 20;
  await svc.begin();
  assert(svc.store.read(combat).rounds[1]);
});

test("cancel and stale confirmation leave initiative/history untouched", async () => {
  const { combat } = setup();
  await service({ confirm: async () => false }).prepare();
  assert.equal(combat.writes.length, 0);
  assert.equal(game.journal.length, 0);
  await assert.rejects(service({ confirm: async () => { combat.combatants.get("a").initiative = 19; return true; } }).begin(), /changed/);
  assert.equal(game.journal.length, 0);
});

test("players and non-active GMs cannot mutate or read protected history", async () => {
  setup();
  const svc = service();
  game.user.isActiveGM = false;
  await assert.rejects(svc.begin(), /active GM/);
  game.user.isGM = false;
  await assert.rejects(svc.prepare(), /active GM/);
  assert.throws(() => svc.store.all(), /Only a GM/);
});

test("history is GM-only, not public Combat flags; shared history is rejected", async () => {
  const { combat } = setup();
  const svc = service();
  await svc.begin();
  assert.equal(game.journal[0].ownership.default, 0);
  assert.equal(game.journal[0].ownership.player, 0);
  assert.equal(combat.flags[ID]?.record, undefined);
  game.journal[0].ownership.player = 2;
  assert.throws(() => svc.store.read(combat), /shared/);
});

test("a second simultaneous action is rejected instead of queued for a second reset", async () => {
  setup();
  let resolve;
  const svc = service({ confirm: () => new Promise(r => { resolve = r; }) });
  const first = svc.prepare();
  await assert.rejects(svc.prepare(), /already running/);
  resolve(false);
  await first;
});

test("partial preparation failure blocks repeated clearing; GM can finish rolls and Begin", async () => {
  const { combat } = setup();
  const svc = service();
  combat.failEmbedded = true;
  await assert.rejects(svc.prepare(), /embedded update failed/);
  await assert.rejects(svc.prepare(), /Preparation failed/);
  combat.combatants.get("a").initiative = 18;
  await svc.begin();
  assert(svc.store.read(combat).rounds[1]);
});

test("restore skips removed actors, preserves newcomers, and retains the current actor ID", async () => {
  const { combat } = setup();
  const svc = service();
  await svc.begin();
  combat.combatants.pop();
  combat.combatants.push({ id: "new", name: "Goblin", initiative: 28 });
  combat.combatants.get("c").initiative = 32;
  combat.turn = combat.turns.findIndex(c => c.id === "c");
  await svc.restore();
  assert.equal(combat.combatants.get("new").initiative, 28);
  assert.equal(combat.combatant.id, "c");
});

test("failed turn selection keeps the first snapshot and permits a safe retry", async () => {
  const { combat } = setup();
  const svc = service();
  combat.turn = 2;
  const update = combat.update;
  combat.update = async () => { throw new Error("turn write failed"); };
  await assert.rejects(svc.begin(), /turn write failed/);
  const snapshot = structuredClone(svc.store.read(combat).rounds[1]);
  combat.update = update;
  await svc.begin();
  assert.deepEqual(svc.store.read(combat).rounds[1], snapshot);
  assert.equal(combat.combatant.id, "a");
});

test("store rejects attempted baseline rewrites independently of the UI/service", async () => {
  const { combat } = setup();
  const svc = service();
  await svc.begin();
  const record = svc.store.read(combat);
  record.rounds[1].rows[0].initiative = 100;
  await assert.rejects(svc.store.write(combat, record), /cannot be overwritten/);
});

test("history retains deleted encounters and reading it makes no writes", async () => {
  const { combat } = setup();
  const svc = service();
  await svc.begin();
  const count = combat.writes.length;
  game.combats.length = 0;
  assert.equal(svc.store.all()[0].rounds[1].rows[0].initiative, 21);
  assert.equal(combat.writes.length, count);
});

test("a changed round invalidates pending initiative instead of capturing the wrong round", async () => {
  const { combat } = setup();
  const svc = service();
  await svc.prepare();
  combat.round = 2;
  await assert.rejects(svc.begin(), /round changed/);
  assert.equal(Object.keys(svc.store.read(combat).rounds).length, 0);
});

test("viewed combat wins over a different active combat", () => {
  setup();
  const viewed = fakeCombat({ id: "viewed" });
  game.combats.push(viewed);
  game.combats.viewed = viewed;
  assert.equal(service().getCombat().id, "viewed");
});

test("announcement failure cannot erase a successfully protected snapshot", async () => {
  const { combat } = setup();
  const svc = service({ announce: async () => { throw new Error("notice failed"); } });
  await svc.begin();
  assert(svc.store.read(combat).rounds[1]);
});
