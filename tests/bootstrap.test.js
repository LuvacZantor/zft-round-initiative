import test from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { ID } from "../scripts/constants.js";

test("native lifecycle registers client layout preferences and refreshes both views after encounter naming", async () => {
  const { combat } = setup();
  const callbacks = new Map();
  const hooks = { on(name, fn) { const a = callbacks.get(name) ?? []; a.push(fn); callbacks.set(name, a); },
    once(name, fn) { this.on(name, fn); }, callAll(name, ...args) { for (const fn of callbacks.get(name) ?? []) fn(...args); } };
  globalThis.Hooks = hooks;
  globalThis.requestAnimationFrame = callback => callback();
  const applications = [];
  class Application {
    constructor() { applications.push(this); }
    _canRender() { return undefined; }
    async _prepareContext() { return {}; }
    async render() { this.rendered = true; this.context = await this._prepareContext({}); return this; }
  }
  globalThis.foundry = { applications: { api: { ApplicationV2: Application, HandlebarsApplicationMixin: Base => Base,
    DialogV2: { wait: async () => false } } }, utils: { escapeHTML: s => s, hasProperty: () => false, randomID: () => "bootstrap-notice" } };
  const schemas = new Map(), values = new Map();
  values.set("zft-combat-log.combatNames", {});
  game.settings = {
    register(namespace, key, data) { schemas.set(`${namespace}.${key}`, data); values.set(`${namespace}.${key}`, structuredClone(data.default)); },
    get(namespace, key) { return values.get(`${namespace}.${key}`); },
    async set(namespace, key, value) { values.set(`${namespace}.${key}`, value); }
  };
  const module = { active: true };
  game.modules = { get: key => key === ID ? module : key === "zft-combat-log" ? { active: true } : undefined };
  ui.combat = { viewed: combat, render() {} };
  await import("../scripts/main.js");
  hooks.callAll("init");
  assert.equal(schemas.get(`${ID}.uiPreferences`).scope, "client");
  assert.equal(schemas.get(`${ID}.uiPreferences`).default.compact, true);
  assert.equal(schemas.get(`${ID}.transitionNoticeDuration`).default, 8);
  assert.equal(schemas.get(`${ID}.transitionNoticeDuration`).scope, "world");
  assert.equal(schemas.get(`${ID}.noticeDuration`).default, 4);
  hooks.callAll("ready");
  await module.api.open();
  await module.api.openHistory();
  const controls = applications[0], history = applications[1];
  assert.equal(controls.context.name, "Test Encounter");
  values.set("zft-combat-log.combatNames", { [combat.id]: { name: "Desert Rock Bridge" } });
  hooks.callAll("updateSetting", { key: "zft-combat-log.combatNames" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(controls.context.name, "Desert Rock Bridge");
  assert.equal(history.context.empty, true);
  assert.equal(typeof module.api.setCurrentCombatant, "function");
  assert.equal(typeof module.api.openDetails, "function");
  values.set("zft-combat-log.combatNames", { [combat.id]: { name: "Renamed Encounter" } });
  hooks.callAll("updateSetting", { key: "zft-combat-log.combatNames" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(controls.context.name, "Renamed Encounter");
  assert.equal(combat.writes.length, 0);
  combat.round = 2;
  hooks.callAll("updateCombat", combat, { round: 2 }, {}, "gm");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(combat.getFlag(ID, "notice").title, "Round 1 Complete");
  assert.match(combat.getFlag(ID, "notice").message, /Round 2/);
  assert(Object.keys(combat.writes[0].changes).every(k => k.startsWith(`flags.${ID}.`)));
});
