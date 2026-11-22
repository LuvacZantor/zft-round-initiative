/**
 * Set Turn to Highest Initiative Macro
 * Foundry VTT V13 Build 347 | DnD5e | MidiQOL-safe turn pointer adjustment
 *
 * Purpose:
 * - Manually set the current Combatant to the highest initiative entry in the current tracker.
 * - Does not reset combat.
 * - Does not reroll initiative.
 * - Does not remove, recreate, or update Combatants except for changing Combat.turn.
 *
 * Intended use:
 * - Run this after all soft initiative rerolls are complete.
 */

const ZFT_SET_HIGHEST_INIT = {
  version: "1.0.0",

  /**
   * Ignore combatants with null/undefined initiative.
   * Recommended true so pending player rolls are not selected.
   */
  ignoreUnrolled: true,

  /**
   * Ignore defeated combatants when choosing the highest initiative.
   */
  ignoreDefeated: false,

  /**
   * Tie behavior when multiple combatants have the same highest initiative.
   * "tracker" = use whichever tied combatant appears first in the current sorted tracker.
   */
  tieMode: "tracker"
};

(async () => {
  const cfg = ZFT_SET_HIGHEST_INIT;
  const MODULE = "Set Turn to Highest Initiative";

  console.log(`[ZFT] 🛠️ v${cfg.version} | ${MODULE} started`, { cfg });

  if (!game.user?.isGM) {
    ui.notifications.warn("Only a GM can set the active combat turn.");
    console.warn(`[ZFT] ⛔ v${cfg.version} | Permission failure: user is not GM`, {
      userId: game.user?.id,
      userName: game.user?.name
    });
    return;
  }

  const combat = game.combat ?? game.combats?.viewed ?? canvas?.scene?.combat;

  if (!combat) {
    ui.notifications.warn("No active or viewed combat found.");
    console.warn(`[ZFT] ⚠️ v${cfg.version} | No combat document available`, {
      activeCombat: game.combat?.id,
      viewedCombat: game.combats?.viewed?.id,
      sceneCombat: canvas?.scene?.combat?.id
    });
    return;
  }

  const turns = Array.from(combat.turns ?? []);

  if (!turns.length) {
    ui.notifications.warn("The current combat has no sorted turn entries.");
    console.warn(`[ZFT] ⚠️ v${cfg.version} | Combat has no turns`, {
      combatId: combat.id,
      combatantCount: combat.combatants?.size ?? 0
    });
    return;
  }

  const before = {
    round: combat.round,
    turn: combat.turn,
    combatantId: combat.combatant?.id ?? null,
    combatantName: combat.combatant?.name ?? null
  };

  console.log(`[ZFT] 🎯 v${cfg.version} | Captured current combat turn before adjustment`, before);

  const candidates = turns
    .map((combatant, index) => ({ combatant, index }))
    .filter(({ combatant }) => {
      if (cfg.ignoreUnrolled && (combatant.initiative === null || combatant.initiative === undefined)) return false;
      if (cfg.ignoreDefeated && combatant.defeated) return false;
      return Number.isFinite(Number(combatant.initiative));
    });

  if (!candidates.length) {
    ui.notifications.warn("No eligible combatants with initiative were found.");
    console.warn(`[ZFT] ⚠️ v${cfg.version} | No eligible initiative candidates`, {
      combatId: combat.id,
      ignoreUnrolled: cfg.ignoreUnrolled,
      ignoreDefeated: cfg.ignoreDefeated,
      turns: turns.map((combatant, index) => ({
        index,
        id: combatant.id,
        name: combatant.name,
        initiative: combatant.initiative,
        defeated: combatant.defeated
      }))
    });
    return;
  }

  const highestInitiative = Math.max(...candidates.map(({ combatant }) => Number(combatant.initiative)));
  const highestCandidates = candidates.filter(({ combatant }) => Number(combatant.initiative) === highestInitiative);

  const selected = highestCandidates[0];

  console.log(`[ZFT] 🧮 v${cfg.version} | Highest initiative candidate selected`, {
    combatId: combat.id,
    highestInitiative,
    tieCount: highestCandidates.length,
    tieMode: cfg.tieMode,
    selectedIndex: selected.index,
    selectedCombatant: {
      id: selected.combatant.id,
      name: selected.combatant.name,
      initiative: selected.combatant.initiative,
      defeated: selected.combatant.defeated
    },
    candidates: candidates.map(({ combatant, index }) => ({
      index,
      id: combatant.id,
      name: combatant.name,
      initiative: combatant.initiative,
      defeated: combatant.defeated
    }))
  });

  if (combat.turn === selected.index && combat.combatant?.id === selected.combatant.id) {
    ui.notifications.info(`${selected.combatant.name} is already the active highest-initiative combatant.`);
    console.log(`[ZFT] ✅ v${cfg.version} | Active turn already points to highest initiative combatant`, {
      combatId: combat.id,
      turn: combat.turn,
      combatantId: selected.combatant.id,
      combatantName: selected.combatant.name,
      initiative: selected.combatant.initiative
    });
    return;
  }

  try {
    console.log(`[ZFT] 🏁 v${cfg.version} | Updating Combat.turn to highest initiative combatant`, {
      combatId: combat.id,
      from: before,
      to: {
        turn: selected.index,
        combatantId: selected.combatant.id,
        combatantName: selected.combatant.name,
        initiative: selected.combatant.initiative
      },
      note: "This only updates Combat.turn. It does not reset combat or modify Combatant initiative values."
    });

    await combat.update({ turn: selected.index });

    const refreshedCombat = game.combats?.get(combat.id) ?? combat;

    console.log(`[ZFT] ✅ v${cfg.version} | Combat turn set to highest initiative combatant`, {
      combatId: refreshedCombat.id,
      round: refreshedCombat.round,
      turn: refreshedCombat.turn,
      activeCombatantId: refreshedCombat.combatant?.id ?? null,
      activeCombatantName: refreshedCombat.combatant?.name ?? null,
      activeInitiative: refreshedCombat.combatant?.initiative ?? null
    });

    ui.notifications.info(`Active turn set to ${selected.combatant.name} (${selected.combatant.initiative}).`);
  } catch (error) {
    console.error(`[ZFT] 💥 v${cfg.version} | Failed setting Combat.turn to highest initiative`, {
      combatId: combat.id,
      selectedIndex: selected.index,
      selectedCombatantId: selected.combatant.id,
      error
    });
    ui.notifications.error("Failed to set turn to highest initiative. See console for [ZFT] diagnostics.");
  }
})();
