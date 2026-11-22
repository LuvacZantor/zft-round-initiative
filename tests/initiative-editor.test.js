import test from "node:test";
import assert from "node:assert/strict";
import { setup, fakeCombat } from "./helpers.js";
import { dom, trackerFixture, Element } from "./dom.js";
import { HistoryStore } from "../scripts/store.js";
import { RoundService } from "../scripts/service.js";
import { TrackerControls } from "../scripts/tracker.js";
import { initiativeValue } from "../scripts/initiative-value.js";

function environment() {
  const env = setup(); dom();
  const store = new HistoryStore();
  let tracker;
  const service = new RoundService(store, { confirm: async () => true, refresh: () => tracker?.refresh() });
  tracker = new TrackerControls(service, { openHistory() {}, openDetails() {} });
  const { app, root } = trackerFixture(env.combat); tracker.render(app, root);
  const editor = id => tracker.entries.get(app).editors.find(e => e.combatantId === id);
  return { ...env, store, service, tracker, app, root, editor };
}
const key = (element, name) => element.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: name }));
const settled = () => new Promise(resolve => setImmediate(resolve));
const expected = (combat, id) => ({ round: combat.round, initiative: combat.combatants.get(id).initiative, document: combat.combatants.get(id) });

test("initiative values accept exact finite decimal, zero and negative values without tie-break recalculation", () => {
  for (const [input, number] of [["28.20", 28.2], [" 0 ", 0], ["-4.19", -4.19], ["+.5", .5], [18.19, 18.19]]) assert.equal(initiativeValue(input), number);
  for (const invalid of ["", " ", "NaN", "Infinity", "0x10", "2+3", "1e3", null, undefined, [], {}, true, NaN, Infinity, -Infinity, "9".repeat(500)]) assert.throws(() => initiativeValue(invalid));
});

test("native initiative API retains the current combatant and protected history while sorting a new value", async () => {
  const { combat, service, store } = environment();
  await service.begin(); combat.turn = 3;
  const saved = structuredClone(store.read(combat));
  combat.writes = [];
  await service.editInitiative(combat.id, "b", "28.20", expected(combat, "b"));
  assert.deepEqual(combat.writes, [{ kind: "setInitiative", id: "b", initiative: 28.2 }]);
  assert.equal(combat.combatant.id, "d");
  assert.equal(combat.round, 1);
  assert.deepEqual(store.read(combat), saved);
  assert.equal(combat.combatants.get("c").initiative, 8);
});

test("editing can correct initial rolls at round zero and a numerically unchanged value is a no-op", async () => {
  const { combat, service } = environment(); combat.round = 0;
  assert.equal(await service.editInitiative(combat.id, "a", "21.00", expected(combat, "a")), false);
  assert.equal(combat.writes.length, 0);
  await service.editInitiative(combat.id, "b", "0", expected(combat, "b"));
  assert.equal(combat.round, 0);
  assert.equal(combat.combatants.get("b").initiative, 0);
  assert.equal(game.journal.length, 0);
});

test("stale round, changed value, removed document and missing edit context all reject without overwriting", async () => {
  const { combat, service } = environment();
  const before = expected(combat, "b");
  combat.round++;
  await assert.rejects(service.editInitiative(combat.id, "b", 20, before), /changed while editing/);
  combat.round = before.round; combat.combatants.get("b").initiative = 17;
  await assert.rejects(service.editInitiative(combat.id, "b", 20, before), /changed while editing/);
  await assert.rejects(service.editInitiative(combat.id, "b", 20), /changed while editing/);
  combat.combatants.splice(1, 1);
  await assert.rejects(service.editInitiative(combat.id, "b", 20, before), /no longer/);
  assert.equal(combat.writes.length, 0);
});

test("initiative edits enforce GM permissions and share the round-action lock", async () => {
  const { combat, service } = environment();
  game.user.isActiveGM = false;
  await assert.rejects(service.editInitiative(combat.id, "b", 20, expected(combat, "b")), /active GM/);
  game.user.isGM = false; game.user.isActiveGM = true;
  await assert.rejects(service.editInitiative(combat.id, "b", 20, expected(combat, "b")), /active GM/);
  game.user.isGM = true; service.busy = true;
  await assert.rejects(service.editInitiative(combat.id, "b", 20, expected(combat, "b")), /already running/);
  assert.equal(combat.writes.length, 0);
});

test("click editing and Enter change only the clicked NPC; change events never invoke native handlers twice", async () => {
  const { combat, editor, root } = environment();
  const e = editor("b"); let nativeEvents = 0;
  for (const event of ["change", "click", "pointerdown", "mousedown"]) root.addEventListener(event, () => nativeEvents++);
  e.score.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  e.score.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
  assert.equal(e.input.value, "16"); assert.equal(e.input.selected, true);
  e.input.value = "28.20";
  e.input.dispatchEvent(new Event("change", { bubbles: true }));
  assert.equal(combat.writes.length, 0);
  key(e.input, "Enter"); await settled();
  assert.equal(combat.combatants.get("b").initiative, 28.2);
  assert.equal(combat.combatants.get("c").initiative, 8);
  assert.equal(combat.combatant.id, "a");
  assert.equal(nativeEvents, 0);
  assert.equal(e.editing, false);
  assert.equal(document.activeElement, e.score);
});

test("Escape, click-away blur and partial re-render cancel unsaved text without changing initiative", async () => {
  const { combat, editor, tracker, app, root } = environment();
  const e = editor("a");
  key(e.score, " "); e.input.value = "3"; key(e.input, "Escape");
  assert.equal(e.editing, false); assert.equal(document.activeElement, e.score);
  e.start(); e.input.value = "4"; e.input.blur();
  assert.equal(e.editing, false);
  e.start(); e.input.value = "5"; const detachedInput = e.input;
  tracker.render(app, root);
  key(detachedInput, "Enter"); detachedInput.blur(); await settled();
  assert.equal(combat.combatants.get("a").initiative, 21);
  assert.equal(combat.writes.length, 0);
  assert.equal(root.querySelectorAll(".zft-ri-edit-score").length, 4);
});

test("empty/invalid input remains editable and never turns into zero or clears the stored roll", async () => {
  const { combat, editor } = environment();
  const e = editor("a"); e.start();
  for (const value of ["", " ", "bad", "Infinity"]) {
    e.input.value = value;
    await assert.rejects(e.commit(), /numeric initiative|finite/);
    assert.equal(e.editing, true); assert.notEqual(e.input.disabled, true);
  }
  assert.equal(combat.combatants.get("a").initiative, 21);
  assert.equal(combat.writes.length, 0);
  e.finish();
});

test("an initiative/round change during editing is refused and displays the fresh value", async () => {
  const { combat, editor } = environment();
  const e = editor("b"); e.start(); e.input.value = "5";
  combat.combatants.get("b").initiative = 17;
  await assert.rejects(e.commit(), /changed while editing/);
  assert.equal(e.score.textContent, "17");
  e.start(); e.input.value = "6"; combat.round++;
  await assert.rejects(e.commit(), /changed while editing/);
  assert.equal(combat.combatants.get("b").initiative, 17);
  assert.equal(combat.writes.length, 0);
});

test("switching viewed encounters while editing refuses to save to the old or new encounter", async () => {
  const { combat, editor, app } = environment();
  const other = fakeCombat({ id: "other" }); game.combats.push(other);
  const e = editor("b"); e.start(); e.input.value = "5"; app.viewed = other;
  await assert.rejects(e.commit(), /viewed combat changed/);
  assert.equal(combat.writes.length, 0); assert.equal(other.writes.length, 0);
  e.finish();
});

test("protected inline edits show Changed and Restore still recovers the immutable starting roll", async () => {
  const { combat, editor, service, store, tracker, app } = environment();
  await service.begin();
  const rounds = structuredClone(store.read(combat).rounds);
  const e = editor("b"); e.start(); e.input.value = "-2.15"; await e.commit();
  assert.match(tracker.entries.get(app).label.textContent, /Changed/);
  assert.deepEqual(store.read(combat).rounds, rounds);
  await service.restore(combat.id);
  assert.equal(combat.combatants.get("b").initiative, 16);
  assert.deepEqual(store.read(combat).rounds, rounds);
});

test("existing inputs, interactive initiative controls and unrolled die buttons are preserved", () => {
  const { combat, tracker } = environment(); tracker.entries.forEach((_e, app) => tracker.remove(app));
  combat.combatants.get("c").initiative = null;
  const { app, root } = trackerFixture(combat);
  const hosts = root.querySelectorAll(".token-initiative");
  const input = new Element("input"); hosts[0].replaceChildren(input);
  const link = new Element("a"); hosts[1].replaceChildren(link);
  const roll = hosts[2].querySelector("a");
  tracker.render(app, root);
  assert.equal(tracker.entries.get(app).editors.length, 1);
  assert.equal(hosts[0].querySelector("input"), input);
  assert.equal(hosts[1].querySelector("a"), link);
  assert.equal(hosts[2].querySelector("a"), roll);
});

test("editor teardown restores original node identity and never overwrites another module's replacement", () => {
  const { editor, tracker, app } = environment();
  const a = editor("a"), b = editor("b");
  const originals = [...a.original]; a.start(); a.input.value = "7";
  const foreign = new Element("span"); foreign.textContent = "Another renderer"; b.host.replaceChildren(foreign);
  tracker.remove(app);
  assert.deepEqual(a.host.childNodes, originals);
  assert.equal(a.host.textContent, "21.00");
  assert.equal(b.host.children[0], foreign);
});

test("a slow native save ignores repeated Enter/Escape and a failed save releases the lock for retry", async () => {
  const { combat, editor, service } = environment();
  const original = combat.setInitiative.bind(combat); let release;
  combat.setInitiative = (id, value) => new Promise(resolve => { release = () => resolve(original(id, value)); });
  const e = editor("b"); e.start(); e.input.value = "10.15";
  const save = e.commit();
  key(e.input, "Escape"); assert.equal(e.editing, true);
  assert.equal(await e.commit(), undefined);
  release(); await save;
  assert.equal(combat.writes.length, 1);
  combat.setInitiative = async () => { throw new Error("native save failed"); };
  e.start(); e.input.value = "11";
  await assert.rejects(e.commit(), /native save failed/);
  assert.equal(service.busy, false); assert.equal(e.editing, false);
  assert.equal(combat.combatants.get("b").initiative, 10.15);
  combat.setInitiative = original;
  e.start(); e.input.value = "12"; await e.commit();
  assert.equal(combat.combatants.get("b").initiative, 12);
});

test("a popout editor updates its own viewed encounter even when the active encounter differs", async () => {
  const { combat, service, tracker } = environment();
  const other = fakeCombat({ id: "other", round: 4 }); game.combats.push(other);
  const pop = trackerFixture(other, { popout: true }); tracker.render(pop.app, pop.root);
  const e = tracker.entries.get(pop.app).editors.find(e => e.combatantId === "b");
  e.start(); e.input.value = "30.19"; await e.commit();
  assert.equal(other.combatants.get("b").initiative, 30.19);
  assert.equal(other.combatant.id, "a");
  assert.equal(other.round, 4); assert.equal(combat.writes.length, 0);
  assert.equal(service.busy, false);
});

test("header-only remounts cannot redisplay a stashed pre-edit score after a successful correction", async () => {
  const { editor, tracker, app, root } = environment();
  const e = editor("b"); e.start(); e.input.value = "28.20"; await e.commit();
  tracker.render(app, root);
  assert.equal(editor("b").score.textContent, "28.2");
  assert.equal(root.querySelectorAll(".zft-ri-edit-score").length, 4);
});
