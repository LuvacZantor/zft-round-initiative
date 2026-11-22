import { ID, reportError } from "./constants.js";
import { roundControlState } from "./control-state.js";
import { COMPACT_WIDTH, clampPosition, normalizePreferences } from "./layout.js";
import { bindTooltips, hideTooltip } from "./tooltips.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export async function confirmAction(title, message) {
  const result = await DialogV2.wait({
    window: { title: `ZFT Round Initiative | ${title}` },
    position: { width: 460, height: "auto" },
    content: `<p>${foundry.utils.escapeHTML(message)}</p>`,
    buttons: [
      { action: "cancel", label: "Cancel", default: true, callback: () => false },
      { action: "continue", label: title, callback: () => true }
    ], modal: true, rejectClose: false
  });
  return result === true;
}

export class RoundControls extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "zft-round-initiative-controls", classes: ["zft-ri-window", "zft-ri-controls"],
    window: { title: "Round Initiative", icon: "fa-solid fa-arrow-down-1-9", resizable: true },
    position: { width: COMPACT_WIDTH, height: "auto" },
    actions: {
      prepare() { return this.act("prepare"); }, begin() { return this.act("begin"); },
      restore() { return this.act("restore"); },
      history() { this.openHistory(); },
      toggle() { return this.toggleMode(); }
    }
  };
  static PARTS = { body: { template: `modules/${ID}/templates/controls.hbs` } };

  constructor(service, openHistory) {
    super(); this.service = service; this.openHistory = openHistory; this.displayedCombatId = null;
    this.compact = this.preferences().compact; this.layoutPending = true;
  }
  _canRender(options) { return Boolean(game.user?.isGM) && super._canRender(options); }

  preferences() { return normalizePreferences(game.settings.get(ID, "uiPreferences")); }

  async toggleMode() {
    this.compact = !this.compact;
    this.layoutPending = true;
    try { await game.settings.set(ID, "uiPreferences", { ...this.preferences(), compact: this.compact }); }
    catch (error) { reportError(error); }
    return this.render({ force: true });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.classList.toggle("zft-ri-compact", this.compact);
    this.releaseTooltips?.();
    this.releaseTooltips = bindTooltips(this.element);
    if (this.layoutPending) { this.layoutPending = false; this.keepOnScreen(true); }
  }

  keepOnScreen(restoreSaved = false) {
    if (!this.element) return;
    const prefs = this.preferences();
    const bounds = this.element.getBoundingClientRect();
    const position = clampPosition({
      width: this.compact ? COMPACT_WIDTH : prefs.expandedWidth,
      height: this.compact ? 110 : bounds.height,
      left: restoreSaved ? prefs.left ?? this.position.left : this.position.left,
      top: restoreSaved ? prefs.top ?? this.position.top : this.position.top
    }, { width: innerWidth, height: innerHeight });
    this.restoringPosition = true;
    try { this.setPosition({ ...position, height: "auto" }); }
    finally { this.restoringPosition = false; }
  }

  _onPosition(position) {
    super._onPosition(position);
    hideTooltip();
    if (!this.rendered || this.restoringPosition) return;
    clearTimeout(this.positionTimer);
    this.positionTimer = setTimeout(() => { void this.savePosition().catch(reportError); }, 200);
  }

  async savePosition() {
    const prefs = this.preferences();
    return game.settings.set(ID, "uiPreferences", normalizePreferences({ ...prefs, compact: this.compact,
      left: this.position.left, top: this.position.top,
      expandedWidth: this.compact ? prefs.expandedWidth : this.position.width }));
  }

  _onClose(options) {
    clearTimeout(this.positionTimer);
    this.releaseTooltips?.();
    void this.savePosition().catch(reportError);
    return super._onClose(options);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    let combat, error = null;
    try { combat = this.service.getCombat(this.boundCombatId); }
    catch (e) { error = e.message; }
    this.displayedCombatId = combat?.id ?? null;
    const state = roundControlState(this.service, combat, error);
    state.actions.push({ action: "toggle", label: this.compact ? "Expand Details" : "Condense Controls",
      icon: this.compact ? "fa-expand" : "fa-compress", disabled: false,
      tip: this.compact ? "Expand encounter details, help and labeled controls." : "Condense to the round status and icon buttons." });
    return { ...context, ...state, compact: this.compact };
  }

  async act(method) {
    try {
      if (!this.displayedCombatId || this.service.getCombat(this.boundCombatId).id !== this.displayedCombatId) throw new Error("The viewed combat changed. Review the round controls before trying again.");
      await this.service[method](this.displayedCombatId);
    }
    catch (e) { reportError(e); }
  }
}

export class HistoryView extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "zft-round-initiative-history", classes: ["zft-ri-window", "zft-ri-history"],
    window: { title: "ZFT Initiative History | GM", icon: "fa-solid fa-clock-rotate-left", resizable: true },
    position: { width: 650, height: 560 }
  };
  static PARTS = { body: { template: `modules/${ID}/templates/history.hbs`, scrollable: [".zft-ri-history-list"] } };
  constructor(store) { super(); this.store = store; }
  _canRender(options) { return Boolean(game.user?.isGM) && super._canRender(options); }
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    try {
      const encounters = this.store.all().map(record => ({ ...record,
        rounds: Object.values(record.rounds).sort((a, b) => a.round - b.round).map(s => ({ ...s,
          date: new Date(s.capturedAt).toLocaleString(),
          rows: s.rows.map(r => ({ ...r, value: r.initiative === null ? "Unrolled" : r.initiative }))
        }))
      }));
      return { ...context, encounters, empty: !encounters.some(e => e.rounds.length) };
    } catch (e) { return { ...context, error: e.message }; }
  }
}

