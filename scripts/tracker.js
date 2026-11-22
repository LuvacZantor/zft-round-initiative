import { activeGM, reportError } from "./constants.js";
import { roundControlState } from "./control-state.js";
import { bindTooltips } from "./tooltips.js";
import { InitiativeEditor } from "./initiative-editor.js";

const viewed = app => app?.viewed ?? null;
const rootElement = element => element instanceof HTMLElement ? element : element?.[0] instanceof HTMLElement ? element[0] : null;

function iconButton(action, signal, onClick, row = false) {
  const wrap = document.createElement("span");
  wrap.className = row ? "zft-ri-current-wrap" : "zft-ri-tracker-action";
  // Match native inline tracker icons in both the strip and combatant rows.
  // Full-size system button rules must not enlarge either set of controls.
  const button = document.createElement("a");
  button.setAttribute("role", "button");
  button.setAttribute("tabindex", "0");
  button.className = row ? "zft-ri-current" : "zft-ri-tracker-button";
  // Do not use native data-action/data-control attributes or control classes.
  button.dataset.zftRiAction = action;
  const icon = document.createElement("i");
  icon.setAttribute("aria-hidden", "true");
  button.append(icon);
  button.addEventListener("click", event => {
    event.preventDefault(); event.stopPropagation();
    if (!button.disabled) void onClick().catch(reportError);
  }, { signal });
  button.addEventListener("keydown", event => {
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    if (!button.disabled) void onClick().catch(reportError);
  }, { signal });
  // Native tracker mousedown handlers must not select/pan the canvas token.
  for (const event of ["pointerdown", "mousedown", "dblclick", "contextmenu"]) {
    wrap.addEventListener(event, e => e.stopPropagation(), { signal });
  }
  wrap.append(button);
  return { wrap, button, icon };
}

function updateButton(control, { label, tip, icon, disabled = false, style = "" }) {
  control.button.disabled = disabled;
  control.button.setAttribute("aria-disabled", String(disabled));
  control.button.setAttribute("aria-label", label);
  control.wrap.dataset.zftRiTip = tip;
  control.wrap.setAttribute("aria-label", `${label}. ${tip}`);
  if (disabled && control.button.tagName !== "A") control.wrap.setAttribute("tabindex", "0");
  else control.wrap.removeAttribute("tabindex");
  control.icon.className = `fa-solid ${icon}`;
  control.button.classList.toggle("zft-ri-primary", style === "zft-ri-primary");
  control.button.classList.toggle("zft-ri-recover", style === "zft-ri-recover");
}

export class TrackerControls {
  constructor(service, { openHistory, openDetails }) {
    this.service = service;
    this.openHistory = openHistory;
    this.openDetails = openDetails;
    this.entries = new Map();
  }

  remove(app) {
    const entry = this.entries.get(app);
    if (!entry) return;
    entry.abort.abort();
    entry.editors.forEach(editor => editor.destroy());
    entry.releaseTips?.();
    entry.root.querySelectorAll(".zft-ri-tracker-tools, .zft-ri-current-wrap").forEach(node => node.remove());
    this.entries.delete(app);
  }

  render(app, element) {
    this.remove(app);
    const root = rootElement(element);
    if (!root) return;
    // Also remove obsolete dev.2/dev.3 launchers, without touching native DOM.
    root.querySelectorAll(".zft-ri-tracker-tools, .zft-ri-tracker-launcher, .zft-ri-current-wrap").forEach(node => node.remove());
    if (!game.user?.isGM) return;
    const entry = { app, root, combatId: viewed(app)?.id ?? null, abort: new AbortController(), actions: new Map(), rows: [], editors: [] };
    this.entries.set(app, entry);
    const toolbar = document.createElement("div");
    toolbar.className = "zft-ri-tracker-tools";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Round Initiative controls");
    const status = document.createElement("span");
    status.className = "zft-ri-tracker-status";
    status.setAttribute("tabindex", "0");
    const label = document.createElement("span");
    label.setAttribute("aria-live", "polite");
    status.append(label);
    const buttons = document.createElement("div");
    buttons.className = "zft-ri-tracker-actions";
    toolbar.append(status, buttons);
    Object.assign(entry, { toolbar, status, label });
    for (const method of ["prepare", "begin", "restore", "history", "details"]) {
      const control = iconButton(method, entry.abort.signal, () => this.act(entry, method));
      entry.actions.set(method, control);
      buttons.append(control.wrap);
    }
    // Insert as a sibling of the native header/list, never inside its scrolling
    // contents or window-header controls. Handle partial V13 part renders too.
    const header = root.querySelector('[data-application-part="header"]') ?? root.querySelector(".combat-tracker-header");
    if (header) header.insertAdjacentElement("afterend", toolbar);
    else {
      const list = root.querySelector('[data-application-part="tracker"]') ?? root.querySelector("#combat-tracker") ?? root.querySelector(".directory-list");
      if (list) list.insertAdjacentElement("beforebegin", toolbar);
      else (root.querySelector(".window-content") ?? root).prepend(toolbar);
    }
    const combat = viewed(app);
    for (const row of root.querySelectorAll("[data-combatant-id]")) {
      const id = row.dataset.combatantId;
      const combatant = combat?.combatants?.get(id);
      if (!id || !combatant) continue;
      const host = row.querySelector(".combatant-controls");
      if (host) {
        const control = iconButton("current", entry.abort.signal, () => this.act(entry, "current", id), true);
        host.append(control.wrap);
        entry.rows.push({ ...control, id });
      }
      const editor = InitiativeEditor.mount({ host: row.querySelector(".token-initiative"), combatant,
        combatId: entry.combatId, service: this.service, validate: () => this.validate(entry) });
      if (editor) entry.editors.push(editor);
    }
    this.update(entry);
    entry.releaseTips = bindTooltips(root);
  }

  validate(entry) {
    if (!game.user?.isGM || this.entries.get(entry.app) !== entry || !entry.root.isConnected ||
      (viewed(entry.app)?.id ?? null) !== entry.combatId) {
      throw new Error("The viewed combat changed. Review the tracker before trying again.");
    }
  }

  async act(entry, method, id) {
    this.validate(entry);
    if (method === "history") return this.openHistory();
    if (method === "details") return this.openDetails(entry.combatId);
    if (!entry.combatId) throw new Error("No combat is selected in this tracker.");
    if (method === "current") return this.service.setCurrent(entry.combatId, id);
    return this.service[method](entry.combatId);
  }

  update(entry) {
    const selected = viewed(entry.app);
    const stale = (selected?.id ?? null) !== entry.combatId;
    let combat, error = null;
    try {
      if (stale) throw new Error("The viewed combat changed. Wait for the tracker to refresh.");
      if (entry.combatId) {
        combat = this.service.getCombat(entry.combatId);
        if (combat !== selected) throw new Error("This encounter changed. Refresh the tracker.");
      }
    } catch (e) { error = e.message; }
    const state = roundControlState(this.service, combat, error);
    const status = stale ? "View changed" : state.status;
    entry.label.textContent = combat ? `R${state.round} · ${status}` : status;
    const tip = `${state.name ?? "No encounter"}. Round ${state.round}. ${status}.${state.savedAt ? ` Saved ${state.savedAt}.` : ""}${error ? ` ${error}` : ""}`;
    entry.status.dataset.zftRiTip = tip;
    entry.status.setAttribute("aria-label", tip);
    entry.status.classList.toggle("zft-ri-saved", state.snapshot && !state.changed);
    entry.status.classList.toggle("zft-ri-state-changed", state.changed);
    for (const action of state.actions) updateButton(entry.actions.get(action.action), action);
    updateButton(entry.actions.get("details"), { label: "Round Initiative Details", tip: "Open optional round details and labeled controls.", icon: "fa-circle-info", disabled: stale });
    for (const control of entry.rows) {
      const combatant = combat?.combatants?.get(control.id);
      const current = combat?.combatant?.id === control.id;
      const reason = error || (!activeGM() ? "Only the active GM can change the current combatant." : this.service.busy ? "Another action is running." :
        !combatant ? "That combatant is no longer in this encounter." : combat.round < 1 ? "Start combat using Foundry's controls first." : current ? "Already the current combatant." : "");
      const label = `Make ${combatant?.name ?? "this combatant"} the current combatant`;
      updateButton(control, { label, tip: `${label}. Keep this round's initiative and protected snapshot.${reason ? ` Unavailable: ${reason}` : ""}`,
        icon: current ? "fa-circle-check" : "fa-location-arrow", disabled: Boolean(reason) });
      control.button.setAttribute("aria-pressed", String(Boolean(current)));
    }
    entry.editors.forEach(editor => editor.update());
  }

  refresh() {
    for (const [app, entry] of this.entries) {
      if (!entry.root.isConnected || !game.user?.isGM) this.remove(app);
      else this.update(entry);
    }
  }

  async open() {
    if (!game.user?.isGM) return;
    const focus = () => {
      const entries = [...this.entries.values()].filter(e => e.root.isConnected && e.toolbar.isConnected && !e.app.minimized);
      const entry = entries.find(e => e.app === ui.combat?.popout) ?? entries.find(e => e.app === ui.combat) ?? entries[0];
      if (!entry) return false;
      entry.app.bringToFront?.();
      entry.status.focus();
      return true;
    };
    ui.combat?.activate?.();
    if (focus()) return;
    await ui.combat?.render({ force: true });
    if (!focus()) return this.openDetails(); // Explicit fallback for an unavailable native tracker.
  }
}
