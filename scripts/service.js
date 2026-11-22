import { ID, LOG, activeGM, setting } from "./constants.js";
import { createSnapshot, fingerprint, highest, lockSnapshot, restorePlan, rowsFromCombat, sameInitiative } from "./model.js";
import { initiativeValue } from "./initiative-value.js";

export class RoundService {
  constructor(store, { confirm, announce, refresh = () => {} } = {}) {
    this.store = store;
    this.confirm = confirm;
    this.announce = announce;
    this.refresh = refresh;
    this.busy = false;
  }

  getCombat(id) {
    const combat = id ? game.combats?.get(id) : ui.combat?.viewed ?? game.combats?.viewed ?? game.combat;
    if (!combat) throw new Error("No active or viewed combat found.");
    if (!combat.combatants?.size) throw new Error("This combat has no combatants.");
    return combat;
  }

  assertGM() {
    if (!activeGM()) throw new Error("Only the active GM can change round initiative.");
  }

  async run(id, action) {
    this.assertGM();
    if (this.busy) throw new Error("A round action is already running. Wait for it to finish.");
    this.busy = true;
    this.refresh();
    try {
      const combat = this.getCombat(id);
      const result = await action(combat);
      console.info(`${LOG} | Action completed`, { combatId: combat.id, round: combat.round });
      return result;
    } finally { this.busy = false; this.refresh(); }
  }

  async approve(combat, title, message) {
    const before = fingerprint(combat);
    if (!await this.confirm(title, message)) return false;
    this.assertGM();
    if (this.getCombat(combat.id) !== combat || fingerprint(combat) !== before) {
      throw new Error("Combat changed while the confirmation was open. Review it and try again.");
    }
    return true;
  }

  async preserveCurrent(combat, combatantId) {
    if (!combatantId || combat.combatant?.id === combatantId) return;
    const index = combat.turns.findIndex(c => c.id === combatantId);
    if (index >= 0) { this.assertGM(); await combat.update({ turn: index }); }
  }

  async notice(combat, title, message, options = {}) {
    // Presentation failure must not convert a successful recovery into a failure.
    try { await this.announce?.(combat, title, message, options); }
    catch (error) { console.warn(`${LOG} | Announcement unavailable`, error); }
  }

  async endRound() {
    // Keep the old API callable, but never redirect it to a destructive reroll.
    this.assertGM();
    ui.notifications.warn("End Round Notice was retired. Foundry advances rounds; preparation notices are automatic. Use Request Initiative when ready to roll.");
    return false;
  }

  async setCurrent(id, combatantId) {
    return this.run(id, async combat => {
      if (combat.round < 1) throw new Error("Start combat using Foundry's controls before selecting the current combatant.");
      const combatant = combat.combatants.get(combatantId);
      const index = combat.turns.findIndex(c => c.id === combatantId);
      if (!combatant || index < 0) throw new Error("That combatant is no longer in this encounter's turn order.");
      if (combat.combatant?.id === combatantId && combat.turn === index) return false;
      this.assertGM();
      // Resolve the live sorted index immediately before this one native write.
      // Native turn hooks still run; initiative and protected records are untouched.
      await combat.update({ turn: index });
      ui.notifications.info(`Current combatant: ${combatant.name}.`);
      return true;
    });
  }

  async editInitiative(id, combatantId, value, expected) {
    const initiative = initiativeValue(value);
    return this.run(id, async combat => {
      const combatant = combat.combatants.get(combatantId);
      if (!combatant) throw new Error("That combatant is no longer in this encounter.");
      if (!expected || combat.round !== expected.round || combatant !== expected.document || combatant.initiative !== expected.initiative) {
        throw new Error("The round or initiative changed while editing. Review the tracker and try again.");
      }
      if (combatant.initiative === initiative) return false;
      this.assertGM();
      // V13's public API preserves the current combatant while re-sorting.
      // No snapshot/history writes or movement-history calls belong here.
      await combat.setInitiative(combatantId, initiative);
      return true;
    });
  }

  async prepare(id) {
    return this.run(id, async combat => {
      const record = this.store.read(combat);
      const target = Math.max(1, combat.round);
      if (record.rounds[target]) throw new Error(`Round ${target} is already protected. Use Restore Current Round for recovery. Advance the round in Foundry before requesting new rolls.`);
      if (record.state.phase === "collecting" && record.state.round === target) {
        throw new Error("Initiative is already being collected. Existing new rolls were left unchanged.");
      }
      if (record.state.phase === "failed" && record.state.round === target) {
        throw new Error("Preparation failed after it started. Review existing rolls in the tracker, finish the missing rolls there, then use Begin Round.");
      }
      if (!await this.approve(combat, "Request Initiative", `Prepare initiative for Round ${target}? Active players roll their combatants; NPCs and unowned combatants use Foundry's normal initiative rolls.`)) return;
      const currentId = combat.combatant?.id ?? null;
      const eligible = Array.from(combat.combatants).filter(c => setting("includeDefeated") || !c.defeated);
      const hasActiveOwner = c => Boolean(c.actor && game.users.some(u => u.active && !u.isGM && c.actor.testUserPermission(u, "OWNER")));
      const playerOwned = eligible.filter(hasActiveOwner);
      const others = eligible.filter(c => !hasActiveOwner(c));
      record.state = { phase: "collecting", round: target, preparedAt: Date.now() };
      // Persist the phase BEFORE mutation to protect against repeat clicks/reloads.
      await this.store.write(combat, record);
      try {
        this.assertGM();
        if (playerOwned.length) await combat.updateEmbeddedDocuments("Combatant", playerOwned.map(c => ({ _id: c.id, initiative: null })));
        if (setting("rollUnowned") && others.length) {
          await combat.rollInitiative(others.map(c => c.id), { formula: null, messageOptions: {}, updateTurn: true });
        } else if (others.length) {
          // When auto-roll is disabled, show these as pending as well.
          await combat.updateEmbeddedDocuments("Combatant", others.map(c => ({ _id: c.id, initiative: null })));
        }
        await this.preserveCurrent(combat, currentId);
      } catch (error) {
        record.state.phase = "failed";
        await this.store.write(combat, record);
        throw error;
      }
      await this.notice(combat, `Round ${target}: Roll Initiative`, "Use your combat tracker initiative controls.", { kind: "roll", round: target });
      ui.notifications.info(`Round ${target}: initiative requested. Advance/start the round in Foundry if needed, then use Begin Round after rolls are ready.`);
    });
  }

  async begin(id) {
    return this.run(id, async combat => {
      if (combat.round < 1) throw new Error("Start combat using Foundry's controls first. This module does not advance the round counter.");
      let record = this.store.read(combat);
      const pending = record.state;
      if (["collecting", "failed", "starting"].includes(pending.phase) && pending.round !== combat.round) {
        throw new Error("The round changed after initiative was requested. Request initiative for the current round first.");
      }
      const retry = pending.phase === "starting" && pending.round === combat.round;
      if (record.rounds[combat.round] && !retry) throw new Error(`Round ${combat.round} already has its protected snapshot. Use Restore Current Round.`);
      if (retry && !sameInitiative(record.rounds[combat.round], combat)) throw new Error("Initiative changed after the round snapshot was saved. Restore Current Round before continuing.");
      const rows = rowsFromCombat(combat);
      const selected = highest(rows, setting("includeDefeated"));
      if (!selected) throw new Error("There are no eligible rolled initiatives. Finish rolling in the tracker first.");
      const missing = rows.filter(r => r.initiative === null && (setting("includeDefeated") || !r.defeated));
      const warning = missing.length ? ` ${missing.length} eligible combatant(s) have no initiative. They will remain unrolled in the snapshot.` : "";
      if (!await this.approve(combat, "Begin Round", `Protect Round ${combat.round}'s current initiative and select ${selected.name} (${selected.initiative})?${warning}`)) return;
      if (!retry) record = lockSnapshot(record, createSnapshot(combat, { userId: game.user.id }));
      record.state = { phase: "starting", round: combat.round };
      const protectedState = fingerprint(combat);
      // The immutable baseline must be durable BEFORE the first combatant acts.
      await this.store.write(combat, record);
      this.assertGM();
      if (fingerprint(combat) !== protectedState) throw new Error("Combat changed while its starting initiative was being saved. The protected snapshot was retained; review or restore it before beginning play.");
      const index = combat.turns.findIndex(c => c.id === selected.id);
      if (combat.combatant?.id !== selected.id || combat.turn !== index) await combat.update({ turn: index });
      record.state.phase = "active";
      await this.store.write(combat, record);
      await this.notice(combat, `Round ${combat.round} Begins`, "Initiative is set.", { kind: "begin", round: combat.round });
      ui.notifications.info(`Round ${combat.round} initiative protected. Active turn: ${selected.name}.`);
    });
  }

  async restore(id) {
    return this.run(id, async combat => {
      const record = this.store.read(combat);
      const snapshot = record.rounds[combat.round];
      const plan = restorePlan(snapshot, combat);
      const notes = [plan.missing.length ? `${plan.missing.length} removed combatant(s) will be skipped.` : "",
        plan.added.length ? `${plan.added.length} new combatant(s) will keep their current initiative.` : ""].filter(Boolean).join(" ");
      if (!await this.approve(combat, "Restore Current Round", `Restore Round ${combat.round}'s starting initiative and retain the currently active combatant? ${notes}`)) return;
      const currentId = combat.combatant?.id ?? null;
      this.assertGM();
      await combat.updateEmbeddedDocuments("Combatant", plan.updates);
      await this.preserveCurrent(combat, currentId);
      record.state = { phase: "active", round: combat.round };
      record.lastRestoreAt = Date.now();
      await this.store.write(combat, record);
      ui.notifications.info(`Round ${combat.round} starting initiative restored.${notes ? ` ${notes}` : ""}`);
    });
  }
}
