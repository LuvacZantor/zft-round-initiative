import test from "node:test";
import assert from "node:assert/strict";
import { encounterName, isEncounterNameSetting } from "../scripts/names.js";
import { normalizePreferences, clampPosition, COMPACT_WIDTH } from "../scripts/layout.js";
import { HistoryStore } from "../scripts/store.js";
import { RoundService } from "../scripts/service.js";
import { setup } from "./helpers.js";

function naming() {
  const env = setup();
  const names = {};
  game.modules = { get: id => id === "zft-combat-log" ? { active: true } : undefined };
  const get = game.settings.get;
  game.settings.get = (id, key) => id === "zft-combat-log" ? names : get(id, key);
  return { ...env, names };
}

test("initial name and subsequent renames override an already-cached generic name", () => {
  const { names, combat } = naming();
  const store = new HistoryStore();
  assert.equal(encounterName(combat.id, null, "Combat combat"), "Combat combat");
  names[combat.id] = { name: "Desert Rock Bridge" };
  assert.equal(store.read(combat).name, "Desert Rock Bridge");
  names[combat.id].name = "The Ambush";
  assert.equal(store.read(combat).name, "The Ambush");
});

test("saved and deleted-encounter history follows names by ID without changing snapshots or writing to Combat Log", async () => {
  const { names, combat } = naming();
  const store = new HistoryStore();
  await new RoundService(store, { confirm: async () => true }).begin();
  const original = structuredClone(store.read(combat).rounds);
  const journalBefore = structuredClone(game.journal[0].flags);
  const combatWrites = combat.writes.length;
  names[combat.id] = { name: "Named after the snapshot" };
  game.combats.length = 0;
  assert.equal(store.all()[0].name, "Named after the snapshot");
  assert.deepEqual(store.all()[0].rounds, original);
  assert.deepEqual(game.journal[0].flags, journalBefore);
  assert.equal(combat.writes.length, combatWrites);
});

test("native/stored/generic fallbacks work with missing, disabled or unregistered Combat Log", () => {
  setup();
  assert.equal(encounterName("abcdef123", "Native name", "Stored"), "Native name");
  assert.equal(encounterName("abcdef123", null, "Stored"), "Stored");
  assert.equal(encounterName("abcdef123"), "Combat abcdef");
  game.modules = { get: () => ({ active: false }) };
  assert.equal(encounterName("abc", "Native"), "Native");
  game.modules = { get: () => ({ active: true }) };
  game.settings.get = () => { throw new Error("unregistered"); };
  assert.equal(encounterName("abc", null, "Stored"), "Stored");
});

test("setting refresh targets only Combat Log's encounter-name setting", () => {
  assert.equal(isEncounterNameSetting({ key: "zft-combat-log.combatNames" }), true);
  assert.equal(isEncounterNameSetting({ key: "zft-combat-log.sessionStart" }), false);
  assert.equal(isEncounterNameSetting(null), false);
});

test("preferences retain coordinate zero, default to compact, and reject invalid positions", () => {
  assert.equal(normalizePreferences().compact, true);
  assert.equal(normalizePreferences({ compact: false, left: 0 }).left, 0);
  assert.equal(normalizePreferences({ left: "bad", top: Infinity }).left, null);
  assert.equal(normalizePreferences({ top: Infinity }).top, null);
  assert.equal(normalizePreferences(null).compact, true);
});

test("restoring a position after a viewport change keeps the compact controls on screen", () => {
  const position = clampPosition({ width: COMPACT_WIDTH, height: 110, left: 1700, top: 950 }, { width: 800, height: 600 });
  assert.equal(position.width, COMPACT_WIDTH);
  assert(position.left + position.width <= 792);
  assert(position.top + 110 <= 592);
  const small = clampPosition({ width: 470, height: 800, left: -500, top: -20 }, { width: 240, height: 400 });
  assert.equal(small.left, 0);
  assert.equal(small.top, 0);
  assert.equal(small.width, 224);
});
