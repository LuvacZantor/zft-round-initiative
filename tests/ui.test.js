import test from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { HistoryStore } from "../scripts/store.js";
import { RoundService } from "../scripts/service.js";

let dialogResult = false, dialogOptions;
class ApplicationStub {
  _canRender() { return undefined; } // V13's permitted-render contract.
  async _prepareContext() { return {}; }
  async render() { return this; }
}
globalThis.foundry = { applications: { api: {
  ApplicationV2: ApplicationStub, HandlebarsApplicationMixin: Base => Base,
  DialogV2: { wait: async options => { dialogOptions = options; return dialogResult; } }
} }, utils: { escapeHTML: text => text.replaceAll("<", "&lt;").replaceAll(">", "&gt;") } };
const { RoundControls, HistoryView, confirmAction } = await import("../scripts/ui.js");

test("GM controls respect V13's void/false rendering contract", () => {
  setup();
  const panel = new RoundControls({}, () => {});
  assert.notEqual(panel._canRender({}), false);
  game.user.isGM = false;
  assert.equal(panel._canRender({}), false);
  assert.equal(new HistoryView({})._canRender({}), false);
});

test("control state exposes recovery and blocks re-preparation after a protected start", async () => {
  const { combat } = setup();
  const svc = new RoundService(new HistoryStore(), { confirm: async () => true });
  const panel = new RoundControls(svc, () => {});
  const first = await panel._prepareContext({});
  assert.equal(first.prepareDisabled, false);
  await svc.begin();
  const saved = await panel._prepareContext({});
  assert.equal(saved.prepareDisabled, true);
  assert.equal(saved.beginDisabled, true);
  assert.equal(saved.restoreDisabled, false);
  combat.combatants.get("b").initiative = null;
  assert.equal((await panel._prepareContext({})).changed, true);
});

test("view-only GMs cannot use mutation buttons", async () => {
  setup();
  game.user.isActiveGM = false;
  const panel = new RoundControls(new RoundService(new HistoryStore()), () => {});
  const context = await panel._prepareContext({});
  for (const key of ["prepareDisabled", "beginDisabled", "restoreDisabled"]) assert.equal(context[key], true);
});

test("confirmation defaults to Cancel, escapes content, and requires an explicit true result", async () => {
  assert.equal(await confirmAction("Request", "<script>bad</script>"), false);
  assert.equal(dialogOptions.buttons.find(b => b.default).action, "cancel");
  assert(!dialogOptions.content.includes("<script>"));
  dialogResult = true;
  assert.equal(await confirmAction("Begin", "Message"), true);
  dialogResult = null;
  assert.equal(await confirmAction("Begin", "Message"), false);
});

test("history provides saved values after live initiatives have changed", async () => {
  const { combat } = setup();
  const store = new HistoryStore();
  await new RoundService(store, { confirm: async () => true }).begin();
  combat.combatants.get("a").initiative = null;
  const context = await new HistoryView(store)._prepareContext({});
  assert.equal(context.encounters[0].rounds[0].rows[0].value, 21);
});

test("a panel whose viewed combat changed refuses to mutate the previously shown combat", async () => {
  const { combat } = setup();
  const svc = new RoundService(new HistoryStore(), { confirm: async () => true });
  const panel = new RoundControls(svc, () => {});
  await panel._prepareContext({});
  game.combats.viewed = { id: "other", combatants: { size: 1 } };
  let error;
  ui.notifications.error = message => { error = message; };
  await panel.act("prepare");
  assert.match(error, /viewed combat changed/);
  assert.equal(combat.writes.length, 0);
});

test("compact is the default and every action has an accessible label and effect tooltip", async () => {
  setup();
  const panel = new RoundControls(new RoundService(new HistoryStore()), () => {});
  const context = await panel._prepareContext({});
  assert.equal(context.compact, true);
  assert.equal(context.actions.length, 5);
  assert(!context.actions.some(a => a.action === "end"));
  assert(context.actions.every(a => a.label && a.icon && a.tip));
  const restore = context.actions.find(a => a.action === "restore");
  assert.equal(restore.disabled, true);
  assert.match(restore.tip, /Unavailable: No starting snapshot/);
});

test("condensing and expanding persists per-client UI state without touching combat or snapshots", async () => {
  const { combat, settings } = setup();
  const store = new HistoryStore();
  const svc = new RoundService(store, { confirm: async () => true });
  await svc.begin();
  const saved = structuredClone(store.read(combat).rounds);
  const writes = combat.writes.length;
  const panel = new RoundControls(svc, () => {});
  await panel.toggleMode();
  assert.equal(settings.uiPreferences.compact, false);
  assert.equal((await panel._prepareContext({})).compact, false);
  assert.equal(new RoundControls(svc, () => {}).compact, false);
  await panel.toggleMode();
  assert.equal(settings.uiPreferences.compact, true);
  assert.deepEqual(store.read(combat).rounds, saved);
  assert.equal(combat.writes.length, writes);
});

test("saved position and expanded width are independent of initiative records", async () => {
  const { settings, combat } = setup();
  const panel = new RoundControls(new RoundService(new HistoryStore()), () => {});
  panel.position = { left: 0, top: 60, width: 520 };
  panel.compact = false;
  await panel.savePosition();
  assert.equal(settings.uiPreferences.left, 0);
  assert.equal(settings.uiPreferences.top, 60);
  assert.equal(settings.uiPreferences.expandedWidth, 520);
  assert.equal(combat.writes.length, 0);
});
