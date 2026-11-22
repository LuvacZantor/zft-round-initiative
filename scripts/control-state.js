import { VERSION, activeGM } from "./constants.js";
import { sameInitiative } from "./model.js";

// Shared by the embedded tracker controls and the optional details window.
// Reading UI state never writes or creates a history journal.
export function roundControlState(service, combat, error = null) {
  let record;
  try { if (combat) record = service.store.read(combat); }
  catch (e) { error = e.message; }
  const snapshot = record?.rounds?.[combat?.round];
  const phase = record?.state?.phase ?? "idle";
  const target = Math.max(1, combat?.round ?? 0);
  const samePending = record?.state?.round === target && ["collecting", "failed"].includes(phase);
  const disabled = !combat || !activeGM() || service.busy || Boolean(error);
  const changed = snapshot ? !sameInitiative(snapshot, combat) : false;
  const prepareDisabled = disabled || Boolean(snapshot) || samePending;
  const beginDisabled = disabled || combat?.round < 1 || (Boolean(snapshot) && phase !== "starting");
  const restoreDisabled = disabled || !snapshot;
  const commonReason = error || (!combat ? "No combat is selected." : !activeGM() ? "Only the active GM can change initiative." : service.busy ? "Another action is running." : "");
  const withReason = (effect, off, reason) => effect + (off ? ` Unavailable: ${commonReason || reason}` : "");
  const actions = [
    { action: "prepare", label: "Request Initiative", icon: "fa-dice-d20", disabled: prepareDisabled,
      tip: withReason("Clear connected players' initiative and roll NPCs/unowned combatants. Ask players to roll again.", prepareDisabled, snapshot ? "This round is protected. Advance the round in Foundry for new rolls; use Restore for recovery." : "Initiative is already being collected; finish rolls in the tracker.") },
    { action: "begin", label: "Begin Round & Protect", icon: "fa-play", style: "zft-ri-primary", disabled: beginDisabled,
      tip: withReason("Save this round's starting initiative and select the highest initiative holder. The round counter stays unchanged.", beginDisabled, snapshot ? "This round is already protected." : "Start combat using Foundry's controls first.") },
    { action: "restore", label: "Restore Current Round", icon: "fa-clock-rotate-left", style: "zft-ri-recover", disabled: restoreDisabled,
      tip: withReason("Recover the CURRENT round's saved starting initiative, keeping the currently selected combatant when possible.", restoreDisabled, "No starting snapshot has been saved for this round.") },
    { action: "history", label: "View Initiative History", icon: "fa-book-open", disabled: false,
      tip: "View protected starting initiative by encounter and round. Opens a read-only GM history window." }
  ];
  const status = service.busy ? "Working" : !combat ? "No combat" : changed ? "Changed" : snapshot ? "Protected" :
    phase === "failed" ? "Check rolls" : combat.round < 1 ? "Not started" : phase === "collecting" ? `${Array.from(combat.combatants).filter(c => c.initiative == null).length} pending` : "Not protected";
  return { actions, status, version: VERSION, error, hasCombat: Boolean(combat),
    name: record?.name ?? combat?.name, round: combat?.round ?? 0, phase,
    snapshot: Boolean(snapshot), changed, busy: service.busy, inactiveGM: !activeGM(),
    prepareDisabled, beginDisabled, restoreDisabled,
    savedAt: snapshot ? new Date(snapshot.capturedAt).toLocaleString() : "",
    missingCount: Array.from(combat?.combatants ?? []).filter(c => c.initiative == null).length
  };
}
