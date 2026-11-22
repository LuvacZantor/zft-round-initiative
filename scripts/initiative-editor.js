import { activeGM, reportError } from "./constants.js";
import { initiativeValue } from "./initiative-value.js";

// Edits only a rolled score label. Existing native/third-party inputs and die
// controls remain owned by their original implementation.
export class InitiativeEditor {
  static mount(options) {
    const { host, combatant } = options;
    if (!host || combatant.initiative == null || host.querySelector("input, button, a")) return null;
    return new InitiativeEditor(options);
  }

  constructor({ host, combatant, combatId, service, validate }) {
    Object.assign(this, { host, combatantId: combatant.id, combatId, service, validate });
    this.abort = new AbortController();
    this.original = Array.from(host.childNodes);
    this.originalValue = combatant.initiative;
    const text = host.textContent.trim();
    this.originalText = text && Number(text) === combatant.initiative ? text : String(combatant.initiative);
    this.score = document.createElement("a");
    this.score.className = "zft-ri-edit-score";
    this.score.setAttribute("role", "button");
    this.score.setAttribute("tabindex", "0");
    this.listen(this.score, "click", event => { event.preventDefault(); event.stopPropagation(); this.start(); });
    this.listen(this.score, "keydown", event => {
      if (["Enter", " "].includes(event.key)) { event.preventDefault(); event.stopPropagation(); this.start(); }
    });
    this.stopRowEvents(this.score);
    host.replaceChildren(this.score);
    this.update();
  }

  listen(element, event, fn) {
    element.addEventListener(event, fn, { signal: element === this.input ? this.inputAbort.signal : this.abort.signal });
  }
  stopRowEvents(element) {
    for (const name of ["pointerdown", "mousedown", "dblclick", "contextmenu", "change", "input"]) {
      this.listen(element, name, event => event.stopPropagation());
    }
  }

  current() {
    this.validate();
    if (this.disposed || !this.host.isConnected) throw new Error("This initiative editor is no longer active.");
    const combat = this.service.getCombat(this.combatId);
    const combatant = combat.combatants.get(this.combatantId);
    if (!combatant) throw new Error("That combatant is no longer in this encounter.");
    return { combat, combatant };
  }

  start() {
    if (this.editing || this.disposed) return;
    try {
      const { combat, combatant } = this.current();
      if (!activeGM()) throw new Error("Only the active GM can edit initiative.");
      if (this.service.busy) throw new Error("Another round action is running. Wait for it to finish.");
      if (combatant.initiative == null || this.score.parentElement !== this.host) throw new Error("Initiative changed. Review the tracker before editing.");
      this.expected = { round: combat.round, initiative: combatant.initiative, document: combatant };
      this.input = document.createElement("input");
      this.inputAbort = new AbortController();
      this.input.className = "zft-ri-initiative-input";
      this.input.type = "text";
      this.input.inputMode = "decimal";
      this.input.value = String(combatant.initiative);
      this.input.setAttribute("aria-label", `Initiative for ${combatant.name}. Enter saves; Escape or clicking away cancels.`);
      this.listen(this.input, "keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault(); event.stopPropagation();
          void this.commit().catch(reportError);
        } else if (event.key === "Escape") {
          event.preventDefault(); event.stopPropagation(); if (!this.saving) this.finish(true);
        }
      });
      this.listen(this.input, "blur", () => { if (!this.saving) this.finish(); });
      this.listen(this.input, "click", event => event.stopPropagation());
      this.stopRowEvents(this.input);
      this.editing = true;
      this.host.replaceChildren(this.input);
      this.input.focus(); this.input.select();
    } catch (error) { reportError(error); }
  }

  async commit() {
    if (!this.editing || this.saving || this.disposed) return;
    // Invalid text remains editable. Never coerce an empty field to zero.
    const value = initiativeValue(this.input.value);
    this.current();
    if (this.input.parentElement !== this.host) throw new Error("This initiative editor was replaced. No value was saved.");
    this.saving = true;
    this.input.disabled = true;
    try {
      await this.service.editInitiative(this.combatId, this.combatantId, value, this.expected);
    } finally {
      this.saving = false;
      this.finish(true);
    }
  }

  finish(focus = false) {
    if (!this.editing || this.disposed) return;
    this.editing = false;
    this.inputAbort?.abort();
    // Removing an input must never save it through a blur handler.
    if (this.input?.parentElement === this.host) this.host.replaceChildren(this.score);
    this.update();
    if (focus && this.score.isConnected) this.score.focus();
  }

  update() {
    if (this.disposed) return;
    const combatant = game.combats?.get(this.combatId)?.combatants?.get(this.combatantId);
    const value = combatant?.initiative;
    const off = !activeGM() || this.service.busy || value == null;
    this.score.setAttribute("aria-disabled", String(off));
    this.score.setAttribute("aria-label", `Edit initiative for ${combatant?.name ?? "this combatant"}`);
    this.score.dataset.zftRiTip = `Edit initiative. Enter saves; Escape or clicking away cancels.${off ? " Unavailable: active GM, a rolled value and no running action are required." : ""}`;
    this.score.textContent = value === this.originalValue ? this.originalText : value == null ? "—" : String(value);
  }

  destroy() {
    this.disposed = true;
    this.editing = false;
    this.abort.abort();
    this.inputAbort?.abort();
    // Preserve any later native/third-party replacement of this host's content.
    if (this.host.childNodes.length === 1 && [this.score, this.input].includes(this.host.childNodes[0])) {
      this.host.replaceChildren(...this.original);
    }
  }
}
