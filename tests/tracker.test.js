import test from "node:test";
import assert from "node:assert/strict";
import { dom, trackerFixture, Element } from "./dom.js";
import { setup, fakeCombat } from "./helpers.js";
import { HistoryStore } from "../scripts/store.js";
import { RoundService } from "../scripts/service.js";
import { TrackerControls } from "../scripts/tracker.js";

function environment() {
  const env = setup(); dom();
  const store = new HistoryStore();
  const calls = [];
  let tracker;
  const service = new RoundService(store, { confirm: async () => true, refresh: () => tracker?.refresh() });
  tracker = new TrackerControls(service, { openHistory: async () => calls.push("history"), openDetails: async id => calls.push(["details", id]) });
  return { ...env, store, service, tracker, calls };
}

test("embedded toolbar and per-combatant controls coexist with native and timing DOM without duplicates", () => {
  const { combat, tracker } = environment();
  const { app, root } = trackerFixture(combat);
  const timer = root.querySelector(".zft-turn-time-controls");
  const native = root.querySelector(".combat-controls");
  tracker.render(app, root);
  const old = root.querySelector(".zft-ri-tracker-tools");
  tracker.render(app, [root]);
  assert.equal(root.querySelectorAll(".zft-ri-tracker-tools").length, 1);
  assert.equal(root.querySelectorAll(".zft-ri-current").length, 4);
  assert.equal(root.querySelectorAll(".native-target").length, 4);
  assert.equal(root.querySelector(".zft-turn-time-controls"), timer);
  assert.equal(root.querySelector(".combat-controls"), native);
  assert.equal(root.children[1], root.querySelector(".zft-ri-tracker-tools"));
  assert.equal(root.children[2].className, "directory-list");
  assert.equal(old.isConnected, false);
  assert.equal(tracker.entries.get(app).actions.size, 5);
  assert.equal(game.journal.length, 0);
});

test("toolbar placement works without Turn Time, without native controls, or without a footer", () => {
  const { combat, tracker } = environment();
  for (const options of [{ timer: false }, { nativeControls: false }, { footer: false }]) {
    const { app, root } = trackerFixture(combat, options);
    tracker.render(app, root);
    assert.equal(root.querySelectorAll(".zft-ri-tracker-tools").length, 1);
    assert.equal(root.querySelectorAll(".zft-ri-current").length, 4);
    assert.equal(root.children[1], root.querySelector(".zft-ri-tracker-tools"));
  }
});

test("top strip uses a header sibling or inserts before the scrolling list, with a safe empty-root fallback", () => {
  const { combat, tracker } = environment();
  for (const options of [{ header: true }, { header: false }, { header: false, list: false }]) {
    const { app, root } = trackerFixture(combat, options);
    tracker.render(app, root);
    const toolbar = root.querySelector(".zft-ri-tracker-tools");
    assert.equal(toolbar.parentElement, root);
    assert.equal(root.children.indexOf(toolbar), options.header ? 1 : 0);
    assert.equal(root.querySelector(".directory-list")?.querySelector(".zft-ri-tracker-tools") ?? null, null);
    const timer = root.querySelector(".zft-turn-time-controls");
    assert.equal(timer.parentElement.tagName, "FOOTER");
  }
});

test("Make Current is an inline accessible icon with keyboard activation and a disabled current state", async () => {
  const { combat, tracker } = environment();
  const { app, root } = trackerFixture(combat); tracker.render(app, root);
  const entry = tracker.entries.get(app), control = entry.rows.find(c => c.id === "b");
  assert.equal(control.button.tagName, "A");
  assert.equal(control.button.getAttribute("role"), "button");
  assert.equal(control.button.getAttribute("tabindex"), "0");
  control.button.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: "Enter" }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(combat.combatant.id, "b");
  assert.equal(control.button.getAttribute("aria-disabled"), "true");
  control.button.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: " " }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(combat.writes.length, 1);
});

test("strip icons use keyboard-accessible inline controls and disabled actions cannot execute", async () => {
  const { combat, tracker, calls } = environment();
  const { app, root } = trackerFixture(combat); tracker.render(app, root);
  const entry = tracker.entries.get(app);
  for (const { button, wrap } of entry.actions.values()) {
    assert.equal(button.tagName, "A");
    assert.equal(button.getAttribute("role"), "button");
    assert.equal(button.getAttribute("tabindex"), "0");
    assert(button.getAttribute("aria-label"));
    assert(wrap.dataset.zftRiTip);
  }
  const restore = entry.actions.get("restore");
  assert.equal(restore.button.getAttribute("aria-disabled"), "true");
  for (const key of ["Enter", " "]) {
    restore.button.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key }));
  }
  restore.button.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
  entry.actions.get("history").button.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: "Enter" }));
  entry.actions.get("details").button.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: " " }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ["history", ["details", combat.id]]);
  assert.equal(combat.writes.length, 0);
  assert.equal(game.journal.length, 0);
});

test("row click selects the clicked combatant without selecting a token or firing native row clicks", async () => {
  const { combat, tracker } = environment();
  const { app, root } = trackerFixture(combat);
  tracker.render(app, root);
  const entry = tracker.entries.get(app);
  const control = entry.rows.find(c => c.id === "c");
  let nativeEvents = 0;
  for (const type of ["click", "mousedown", "pointerdown"]) root.addEventListener(type, () => nativeEvents++);
  control.button.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  control.button.dispatchEvent(new Event("mousedown", { bubbles: true }));
  control.button.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(combat.combatant.id, "c");
  assert.equal(nativeEvents, 0);
  assert.equal(control.button.getAttribute("aria-pressed"), "true");
  assert.equal(control.button.disabled, true);
  assert.match(control.wrap.dataset.zftRiTip, /Already the current/);
  assert.equal(combat.writes.length, 1);
});

test("toolbar actions and details bind to each tracker window's viewed encounter", async () => {
  const { combat, tracker, store, calls } = environment();
  const other = fakeCombat({ id: "other", round: 4 }); game.combats.push(other);
  const dock = trackerFixture(combat), pop = trackerFixture(other, { popout: true });
  tracker.render(dock.app, dock.root); tracker.render(pop.app, pop.root);
  const entry = tracker.entries.get(pop.app);
  await tracker.act(entry, "begin");
  assert(store.read(other).rounds[4]);
  assert.equal(store.read(combat).rounds[1], undefined);
  await tracker.act(entry, "details");
  await tracker.act(entry, "history");
  assert.deepEqual(calls, [["details", "other"], "history"]);
  assert.equal(combat.writes.length, 0);
});

test("stale view, deleted encounter, detached root and old render handlers refuse mutations", async () => {
  const { combat, tracker } = environment();
  const { app, root } = trackerFixture(combat);
  tracker.render(app, root);
  const old = tracker.entries.get(app);
  app.viewed = fakeCombat({ id: "new" });
  tracker.refresh();
  assert(old.rows.every(c => c.button.disabled));
  await assert.rejects(tracker.act(old, "current", "b"), /viewed combat changed/);
  app.viewed = combat; tracker.render(app, root);
  await assert.rejects(tracker.act(old, "current", "b"), /viewed combat changed/);
  const current = tracker.entries.get(app);
  game.combats.length = 0;
  await assert.rejects(tracker.act(current, "current", "b"), /No active or viewed combat/);
  root.remove();
  await assert.rejects(tracker.act(current, "current", "b"), /viewed combat changed/);
  tracker.refresh(); assert.equal(tracker.entries.size, 0);
  assert.equal(combat.writes.length, 0);
});

test("active-GM, unstarted, removed and busy states have disabled-reason tooltips", () => {
  const { combat, tracker, service } = environment();
  const { app, root } = trackerFixture(combat);
  tracker.render(app, root);
  const entry = tracker.entries.get(app);
  assert(entry.rows.every(c => c.button.getAttribute("aria-label")));
  combat.round = 0; tracker.refresh();
  assert(entry.rows.every(c => c.button.disabled && /Start combat/.test(c.wrap.dataset.zftRiTip)));
  combat.round = 1; service.busy = true; tracker.refresh();
  assert(entry.rows.every(c => c.button.disabled && /Another action/.test(c.wrap.dataset.zftRiTip)));
  service.busy = false; game.user.isActiveGM = false; tracker.refresh();
  assert(entry.rows.every(c => c.button.disabled && /active GM/.test(c.wrap.dataset.zftRiTip)));
  game.user.isActiveGM = true;
  combat.combatants.splice(combat.combatants.findIndex(c => c.id === "b"), 1);
  tracker.refresh();
  assert.match(entry.rows.find(c => c.id === "b").wrap.dataset.zftRiTip, /no longer/);
});

test("player renders remove module controls and active-GM checks protect direct row actions", async () => {
  const { combat, tracker } = environment();
  const { app, root } = trackerFixture(combat); tracker.render(app, root);
  const entry = tracker.entries.get(app);
  game.user.isActiveGM = false;
  await assert.rejects(tracker.act(entry, "current", "b"), /active GM/);
  game.user.isGM = false; tracker.render(app, root);
  assert.equal(root.querySelectorAll(".zft-ri-tracker-tools, .zft-ri-current").length, 0);
  assert.equal(root.querySelectorAll(".native-target").length, 4);
});

test("owned state refresh keeps controls focused and retains protected status after encounter naming", async () => {
  const { combat, tracker, service } = environment();
  const { app, root } = trackerFixture(combat); tracker.render(app, root);
  const entry = tracker.entries.get(app);
  entry.status.focus();
  await service.begin();
  tracker.refresh();
  assert.equal(document.activeElement, entry.status);
  assert.match(entry.label.textContent, /Protected/);
  combat.name = "Named Encounter"; tracker.refresh();
  assert.match(entry.status.dataset.zftRiTip, /Named Encounter/);
  combat.combatants.get("a").initiative = null; tracker.refresh();
  assert.match(entry.label.textContent, /Changed/);
  assert.equal(entry.actions.get("restore").button.disabled, false);
  assert.equal(entry.actions.get("prepare").button.disabled, true);
});

test("open focuses the existing native popout strip; close cleans up only owned listeners and nodes", async () => {
  const { combat, tracker, calls } = environment();
  const dock = trackerFixture(combat), pop = trackerFixture(combat, { popout: true });
  ui.combat = dock.app; ui.combat.popout = pop.app;
  tracker.render(dock.app, dock.root); tracker.render(pop.app, pop.root);
  await tracker.open();
  const entry = tracker.entries.get(pop.app), button = entry.rows[1].button;
  assert.equal(document.activeElement, entry.status);
  assert.equal(pop.app.focused, true);
  assert.deepEqual(calls, []);
  tracker.remove(pop.app);
  button.dispatchEvent(new Event("click", { cancelable: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(combat.writes.length, 0);
  assert.equal(pop.root.querySelectorAll(".zft-ri-current").length, 0);
  assert(pop.root.querySelector(".zft-turn-time-controls"));
  assert.equal(dock.root.querySelectorAll(".zft-ri-current").length, 4);
  tracker.remove(dock.app);
  assert.equal(tracker.entries.size, 0);
});

test("partial native renders replace owned nodes cleanly and an empty tracker keeps history available", async () => {
  const { combat, tracker, calls } = environment();
  const { app, root } = trackerFixture(combat); tracker.render(app, root);
  const old = tracker.entries.get(app);
  const row = root.querySelectorAll("[data-combatant-id]")[1];
  row.remove();
  const newRow = new Element("li"); newRow.dataset.combatantId = "b";
  const host = new Element(); host.className = "combatant-controls"; newRow.append(host); root.append(newRow);
  tracker.render(app, root);
  assert.equal(root.querySelectorAll(".zft-ri-current").length, 4);
  await assert.rejects(tracker.act(old, "current", "b"), /viewed combat changed/);
  const empty = trackerFixture(null); tracker.render(empty.app, empty.root);
  const entry = tracker.entries.get(empty.app);
  assert.equal(entry.actions.get("begin").button.disabled, true);
  await tracker.act(entry, "history");
  assert.deepEqual(calls, ["history"]);
  assert.equal(combat.writes.length, 0);
});
