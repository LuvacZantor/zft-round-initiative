import { ID, VERSION, LOG, reportError } from "./constants.js";
import { HistoryStore } from "./store.js";
import { RoundService } from "./service.js";
import { announce, hideNotice, showNotice } from "./presentation.js";
import { RoundControls, HistoryView, confirmAction } from "./ui.js";
import { TrackerControls } from "./tracker.js";
import { isEncounterNameSetting } from "./names.js";
import { RoundTransitions } from "./transitions.js";

let controls, history, trackers;
const openDetails = id => {
  if (!game.user?.isGM) return;
  if (controls) controls.boundCombatId = id || undefined;
  return controls?.render({ force: true });
};
const open = () => trackers?.open().catch(reportError);
const openHistory = () => {
  if (!game.user?.isGM) return;
  return history?.render({ force: true });
};
let refreshQueued = false;
function refresh() {
  if (!game.user?.isGM || refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    trackers?.refresh();
    if (controls?.rendered) void controls.render({ force: true });
    if (history?.rendered) void history.render({ force: true });
  });
}

Hooks.once("init", () => {
  for (const [key, data] of Object.entries({
    includeDefeated: { name: "Include defeated combatants", hint: "Matches the supplied macros: defeated combatants can reroll and can hold the highest initiative.", type: Boolean, default: true },
    rollUnowned: { name: "Roll NPCs and unowned combatants", hint: "Request Initiative rolls combatants without an active non-GM owner. Disable to clear their initiative for manual rolling.", type: Boolean, default: true },
    announcements: { name: "Broadcast round announcements", type: Boolean, default: true },
    autoRoundNotices: { name: "Automatic round preparation notices", hint: "When Foundry advances to a new round, announce the completed previous round and preparation for the new round. Rolling stays manual.", type: Boolean, default: true },
    noticeDuration: { name: "Manual announcement duration (seconds)", hint: "Duration of Request Initiative and Begin Round notices. Your existing preference is retained.", type: Number, default: 4, range: { min: 2, max: 12, step: 1 } },
    transitionNoticeDuration: { name: "Automatic round notice duration (seconds)", hint: "How long the completed-round / prepare-for-next-round notice stays visible. A newer roll prompt replaces it immediately.", type: Number, default: 8, range: { min: 2, max: 12, step: 1 } }
  })) game.settings.register(ID, key, { scope: "world", config: true, ...data });
  game.settings.register(ID, "showNotices", { name: "Show round announcements on this client", scope: "client", config: true,
    type: Boolean, default: true, onChange: value => { if (!value) hideNotice(); } });
  game.settings.register(ID, "uiPreferences", { name: "Round control layout", scope: "client", config: false,
    type: Object, default: { compact: true, left: null, top: null, expandedWidth: 470 } });
});

Hooks.once("ready", () => {
  const store = new HistoryStore();
  const service = new RoundService(store, { confirm: confirmAction, announce, refresh });
  const transitions = new RoundTransitions(announce);
  transitions.seed(game.combats);
  if (game.user?.isGM) {
    controls = new RoundControls(service, openHistory);
    history = new HistoryView(store);
    trackers = new TrackerControls(service, { openHistory, openDetails });
  }
  const api = Object.freeze({ version: VERSION, open, openHistory, openDetails,
    requestInitiative: id => service.prepare(id), beginRound: id => service.begin(id),
    endRound: id => service.endRound(id), restoreCurrentRound: id => service.restore(id),
    setCurrentCombatant: (combatId, combatantId) => service.setCurrent(combatId, combatantId) });
  game.modules.get(ID).api = api;
  game.zftRoundInitiative = api;
  for (const event of ["updateCombat", "createCombat", "deleteCombat", "updateCombatant", "createCombatant", "deleteCombatant", "updateJournalEntry", "createJournalEntry", "userConnected"]) {
    Hooks.on(event, refresh);
  }
  Hooks.on("updateSetting", document => { if (isEncounterNameSetting(document)) refresh(); });
  Hooks.on("createCombat", combat => transitions.remember(combat));
  Hooks.on("deleteCombat", combat => transitions.forget(combat));
  globalThis.addEventListener?.("resize", () => { if (controls?.rendered) controls.keepOnScreen(); });
  Hooks.on("updateCombat", (combat, changes, _options, userId) => {
    void transitions.observe(combat, changes).catch(error => console.warn(`${LOG} | Round preparation notice failed`, error));
    if (foundry.utils.hasProperty(changes, `flags.${ID}.notice`) || Object.hasOwn(changes, `flags.${ID}.notice`)) showNotice(combat, userId);
  });
  const viewed = ui.combat?.viewed ?? game.combats?.viewed ?? game.combat;
  if (viewed) showNotice(viewed);
  void ui.combat?.render({ force: true });
  if (ui.combat?.popout?.rendered) void ui.combat.popout.render({ force: true });
  console.info(`${LOG} | Ready. Round Initiative controls are embedded in the existing combat tracker. Round counter remains under Foundry's controls.`);
});

Hooks.on("renderCombatTracker", (app, element) => { trackers?.render(app, element); refresh(); });
Hooks.on("closeCombatTracker", app => trackers?.remove(app));
Hooks.on("zft-tools.collectTools", tools => {
  if (!game.user?.isGM) return;
  tools[ID] = { name: ID, title: "Round Initiative", icon: "fa-solid fa-arrow-down-1-9",
    order: 36, button: true, visible: true, onChange: open };
});
