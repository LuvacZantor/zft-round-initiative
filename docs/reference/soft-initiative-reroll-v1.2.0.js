/**
 * Soft Initiative Reroll Macro
 * Foundry VTT V13 Build 347 | DnD5e | MidiQOL-safe player-owned initiative refresh
 *
 * Purpose:
 * - Reroll initiative for existing Combatants without removing them from combat.
 * - Let players roll initiative for combatants they own.
 * - Avoid Combat.resetAll(), deleting/recreating combatants, or ending/restarting combat.
 * - Use combat-tracker null initiative as the player prompt instead of relying on chat rendering.
 *
 * Usage:
 * - GM runs this macro first.
 * - Player-owned combatants have initiative cleared to null, which marks them as needing initiative.
 * - Players either click the initiative die in the combat tracker or run this same macro.
 * - NPC/unowned combatants can optionally be rolled by the GM.
 */

const ZFT_SOFT_INIT_REROLL = {
  version: "1.2.0",

  /**
   * auto:
   * - GM prepares player-owned combatants for player rolling.
   * - Players roll their owned combatants.
   *
   * gmPrepare:
   * - Force GM preparation behavior.
   *
   * playerRoll:
   * - Force player-owned roll behavior.
   */
  mode: "auto",

  /**
   * GM-side behavior.
   * true = GM immediately rerolls combatants that have no active non-GM owner.
   * false = GM only clears player-owned initiatives and rolls nothing.
   */
  gmRollNpcAndUnownedCombatants: true,

  /**
   * Player prompt strategy.
   * true = clear player-owned initiatives to null so the combat tracker shows them as needing rolls.
   * This does not remove combatants from combat.
   */
  clearPlayerOwnedInitiative: true,

  /**
   * Optional chat request.
   * Default false because some V13 module stacks still have renderChatMessageHTML hooks expecting jQuery.
   * Your uploaded log shows html.find is not a function from a chat render hook, so tracker prompt is safer.
   */
  postChatRequest: false,

  /**
   * Whisper chat request to only active non-GM owners when postChatRequest is true.
   */
  whisperOwnersOnly: true,

  /**
   * Include defeated combatants in rerolls/prep.
   */
  includeDefeated: true,

  /**
   * Optional custom formula.
   * Use null to let DnD5e apply the system/default initiative formula.
   * Example: "1d20 + @abilities.dex.mod + @attributes.init.bonus"
   */
  formula: null,

  /**
   * Chat message options forwarded to Combat#rollInitiative.
   * Keep rollMode undefined to respect each rolling user's current roll mode.
   * Example: { rollMode: CONST.DICE_ROLL_MODES.PRIVATE }
   */
  messageOptions: {},

  /**
   * Foundry Combat#rollInitiative option.
   * true attempts to keep the same current Combatant after initiative order changes.
   */
  updateTurn: true,

  /**
   * Try to restore the same current Combatant after initiative sorting.
   * This is a defensive fallback for wrapper/module interactions where updateTurn does not fully preserve it.
   */
  preserveCurrentCombatant: true
};

(async () => {
  const MODULE = "Soft Initiative Reroll";
  const cfg = ZFT_SOFT_INIT_REROLL;

  console.log(`[ZFT] 🛠️ v${cfg.version} | ${MODULE} started`, { cfg });

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

  const combatants = Array.from(combat.combatants ?? []);

  if (!combatants.length) {
    ui.notifications.warn("The current combat has no combatants.");
    console.warn(`[ZFT] ⚠️ v${cfg.version} | Combat has no combatants`, {
      combatId: combat.id,
      sceneId: combat.scene?.id ?? combat.sceneId
    });
    return;
  }

  const currentSnapshot = captureCombatState(combat);
  console.log(`[ZFT] 🎯 v${cfg.version} | Captured current combat state before reroll`, currentSnapshot);

  const eligibleCombatants = combatants.filter((combatant) => cfg.includeDefeated || !combatant.defeated);

  if (!eligibleCombatants.length) {
    ui.notifications.warn("No eligible combatants found.");
    console.warn(`[ZFT] ⚠️ v${cfg.version} | No eligible combatants after defeated filter`, {
      includeDefeated: cfg.includeDefeated,
      combatantCount: combatants.length
    });
    return;
  }

  const mode = resolveMode(cfg.mode);
  console.log(`[ZFT] 🧭 v${cfg.version} | Resolved macro execution mode`, {
    configuredMode: cfg.mode,
    resolvedMode: mode,
    userId: game.user?.id,
    userName: game.user?.name,
    isGM: game.user?.isGM
  });

  if (mode === "gmPrepare") {
    await gmPreparePlayerInitiativeReroll({ combat, eligibleCombatants, currentSnapshot, cfg });
    return;
  }

  await playerRollOwnedInitiative({ combat, eligibleCombatants, currentSnapshot, cfg });

  function resolveMode(configuredMode) {
    if (configuredMode === "gmPrepare" || configuredMode === "playerRoll") return configuredMode;
    return game.user?.isGM ? "gmPrepare" : "playerRoll";
  }

  async function gmPreparePlayerInitiativeReroll({ combat, eligibleCombatants, currentSnapshot, cfg }) {
    if (!game.user?.isGM) {
      ui.notifications.warn("GM preparation mode must be run by a GM.");
      console.warn(`[ZFT] ⛔ v${cfg.version} | GM preparation blocked: user is not GM`, {
        userId: game.user?.id,
        userName: game.user?.name
      });
      return;
    }

    const ownership = eligibleCombatants.map((combatant) => ({
      combatant,
      activeOwners: getActiveNonGmOwners(combatant)
    }));

    const playerOwned = ownership.filter((entry) => entry.activeOwners.length > 0);
    const playerOwnedCombatants = playerOwned.map((entry) => entry.combatant);
    const npcOrUnowned = ownership.filter((entry) => entry.activeOwners.length === 0).map((entry) => entry.combatant);

    console.log(`[ZFT] 👥 v${cfg.version} | Classified combatants by active ownership`, {
      playerOwned: playerOwned.map((entry) => ({
        id: entry.combatant.id,
        name: entry.combatant.name,
        owners: entry.activeOwners.map((user) => user.name),
        currentInitiative: entry.combatant.initiative
      })),
      npcOrUnowned: npcOrUnowned.map((combatant) => ({
        id: combatant.id,
        name: combatant.name,
        currentInitiative: combatant.initiative
      }))
    });

    if (cfg.clearPlayerOwnedInitiative && playerOwnedCombatants.length) {
      await clearInitiativesForPlayerPrompt({ combat, combatants: playerOwnedCombatants, cfg });
    } else {
      console.log(`[ZFT] 🧩 v${cfg.version} | Player-owned initiative clear skipped`, {
        enabled: cfg.clearPlayerOwnedInitiative,
        playerOwnedCount: playerOwnedCombatants.length
      });
    }

    if (cfg.gmRollNpcAndUnownedCombatants && npcOrUnowned.length) {
      await rollCombatantsWithFoundry({
        combat,
        combatants: npcOrUnowned,
        cfg,
        stage: "GM rolling NPC/unowned combatant initiatives"
      });
    } else {
      console.log(`[ZFT] 🧩 v${cfg.version} | GM NPC/unowned auto-roll skipped`, {
        enabled: cfg.gmRollNpcAndUnownedCombatants,
        npcOrUnownedCount: npcOrUnowned.length
      });
    }

    if (cfg.postChatRequest) {
      await postPlayerRollRequest({ combat, playerOwned, cfg });
    } else {
      console.log(`[ZFT] 💬 v${cfg.version} | Chat request skipped by configuration`, {
        reason: "Tracker prompt is enabled and chat render hooks are unreliable in this V13 stack."
      });
    }

    const refreshedCombat = game.combats?.get(combat.id) ?? combat;
    await restoreCurrentCombatantIfNeeded({ combat: refreshedCombat, currentSnapshot, cfg });
    logCombatResult({ combat: refreshedCombat, currentSnapshot, cfg, stage: "GM preparation completed" });

    const playerText = playerOwnedCombatants.length
      ? `${playerOwnedCombatants.length} player-owned combatant${playerOwnedCombatants.length === 1 ? " was" : "s were"} marked for player initiative.`
      : "No active player-owned combatants were found.";

    ui.notifications.info(`${playerText} Players can click the combat-tracker initiative die or run the macro.`);
  }

  async function playerRollOwnedInitiative({ combat, eligibleCombatants, currentSnapshot, cfg }) {
    const ownedCombatants = eligibleCombatants.filter((combatant) => combatant.actor?.testUserPermission(game.user, "OWNER"));

    if (!ownedCombatants.length) {
      ui.notifications.warn("You do not own any eligible combatants in the current combat.");
      console.warn(`[ZFT] ⚠️ v${cfg.version} | Player has no owned eligible combatants to roll`, {
        userId: game.user?.id,
        userName: game.user?.name,
        combatId: combat.id,
        eligibleCombatants: eligibleCombatants.map((combatant) => ({
          id: combatant.id,
          name: combatant.name,
          actorId: combatant.actor?.id ?? null
        }))
      });
      return;
    }

    await rollCombatantsWithFoundry({
      combat,
      combatants: ownedCombatants,
      cfg,
      stage: "Player rolling owned combatant initiatives"
    });

    const refreshedCombat = game.combats?.get(combat.id) ?? combat;
    await restoreCurrentCombatantIfNeeded({ combat: refreshedCombat, currentSnapshot, cfg });
    logCombatResult({ combat: refreshedCombat, currentSnapshot, cfg, stage: "Player-owned reroll completed" });

    ui.notifications.info(`Rolled initiative for ${ownedCombatants.length} owned combatant${ownedCombatants.length === 1 ? "" : "s"}.`);
  }

  async function clearInitiativesForPlayerPrompt({ combat, combatants, cfg }) {
    const updates = combatants.map((combatant) => ({
      _id: combatant.id,
      initiative: null
    }));

    console.log(`[ZFT] 🧹 v${cfg.version} | Clearing player-owned initiatives for tracker prompt`, {
      combatId: combat.id,
      count: updates.length,
      updates,
      note: "This updates existing Combatants only; it does not remove or recreate them."
    });

    try {
      await combat.updateEmbeddedDocuments("Combatant", updates);

      console.log(`[ZFT] ✅ v${cfg.version} | Player-owned initiatives cleared for reroll prompt`, {
        combatId: combat.id,
        combatants: combatants.map((combatant) => ({
          id: combatant.id,
          name: combatant.name
        }))
      });
    } catch (error) {
      console.error(`[ZFT] 💥 v${cfg.version} | Failed clearing player-owned initiatives`, {
        combatId: combat.id,
        updates,
        error
      });
      ui.notifications.error("Failed to mark player combatants for initiative. See console for [ZFT] diagnostics.");
      throw error;
    }
  }

  async function rollCombatantsWithFoundry({ combat, combatants, cfg, stage }) {
    const ids = combatants.map((combatant) => combatant.id);

    console.log(`[ZFT] 🎲 v${cfg.version} | ${stage}`, {
      combatId: combat.id,
      userId: game.user?.id,
      userName: game.user?.name,
      count: ids.length,
      ids,
      names: combatants.map((combatant) => combatant.name),
      formula: cfg.formula ?? "system default",
      updateTurn: cfg.updateTurn
    });

    try {
      await combat.rollInitiative(ids, {
        formula: cfg.formula,
        messageOptions: cfg.messageOptions,
        updateTurn: cfg.updateTurn
      });

      console.log(`[ZFT] ✅ v${cfg.version} | ${stage} completed`, {
        combatId: combat.id,
        ids
      });
    } catch (error) {
      console.error(`[ZFT] 💥 v${cfg.version} | ${stage} failed`, {
        combatId: combat.id,
        ids,
        error
      });
      ui.notifications.error("Initiative roll failed. See console for [ZFT] diagnostics.");
      throw error;
    }
  }

  async function postPlayerRollRequest({ combat, playerOwned, cfg }) {
    const ownerMap = new Map();

    for (const entry of playerOwned) {
      for (const user of entry.activeOwners) {
        const existing = ownerMap.get(user.id) ?? { user, combatants: [] };
        existing.combatants.push(entry.combatant);
        ownerMap.set(user.id, existing);
      }
    }

    if (!ownerMap.size) {
      console.log(`[ZFT] 💤 v${cfg.version} | No active player owners need initiative request`, {
        combatId: combat.id
      });
      return;
    }

    const ownerIds = Array.from(ownerMap.keys());
    const sections = Array.from(ownerMap.values()).map(({ user, combatants }) => {
      const names = combatants.map((combatant) => `<li>${foundry.utils.escapeHTML(combatant.name)}</li>`).join("");
      return `<section><strong>${foundry.utils.escapeHTML(user.name)}</strong><ul>${names}</ul></section>`;
    }).join("");

    const content = `
      <div class="zft-soft-init-request">
        <h3>Initiative Reroll Requested</h3>
        <p>Click the initiative die in the combat tracker or run the <strong>Soft Initiative Reroll</strong> macro.</p>
        ${sections}
      </div>
    `;

    console.log(`[ZFT] 💬 v${cfg.version} | Posting optional player initiative reroll request`, {
      whisperOwnersOnly: cfg.whisperOwnersOnly,
      ownerIds,
      owners: Array.from(ownerMap.values()).map(({ user, combatants }) => ({
        userId: user.id,
        userName: user.name,
        combatants: combatants.map((combatant) => combatant.name)
      }))
    });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ alias: "Initiative Reroll" }),
      content,
      whisper: cfg.whisperOwnersOnly ? ownerIds : undefined
    });
  }

  function getActiveNonGmOwners(combatant) {
    const actor = combatant.actor;
    if (!actor) return [];

    return game.users.filter((user) => {
      if (!user.active || user.isGM) return false;
      return actor.testUserPermission(user, "OWNER");
    });
  }

  function captureCombatState(combat) {
    return {
      round: combat.round,
      turn: combat.turn,
      combatantId: combat.combatant?.id ?? null,
      tokenId: combat.combatant?.tokenId ?? null,
      name: combat.combatant?.name ?? null
    };
  }

  async function restoreCurrentCombatantIfNeeded({ combat, currentSnapshot, cfg }) {
    if (!cfg.preserveCurrentCombatant || !currentSnapshot.combatantId) return;

    const refreshedCombat = game.combats?.get(combat.id) ?? combat;
    const currentAfter = refreshedCombat.combatant;

    if (currentAfter?.id === currentSnapshot.combatantId) {
      console.log(`[ZFT] 🧷 v${cfg.version} | Current Combatant preserved`, {
        combatantId: currentSnapshot.combatantId,
        turn: refreshedCombat.turn
      });
      return;
    }

    const restoredIndex = refreshedCombat.turns?.findIndex((combatant) => combatant.id === currentSnapshot.combatantId) ?? -1;

    if (restoredIndex < 0) {
      console.warn(`[ZFT] ⚠️ v${cfg.version} | Unable to restore current Combatant; ID not found in sorted turns`, {
        currentSnapshot,
        turns: refreshedCombat.turns?.map((combatant) => ({
          id: combatant.id,
          name: combatant.name,
          initiative: combatant.initiative
        })) ?? []
      });
      return;
    }

    console.warn(`[ZFT] 🧷 v${cfg.version} | Restoring current Combatant after initiative sorting changed turn index`, {
      before: currentSnapshot,
      currentAfter: {
        round: refreshedCombat.round,
        turn: refreshedCombat.turn,
        combatantId: currentAfter?.id ?? null,
        name: currentAfter?.name ?? null
      },
      restoredTurnIndex: restoredIndex,
      note: "This updates Combat.turn only; combatants are not removed or recreated. Verify MidiQOL start-turn automation behavior."
    });

    await refreshedCombat.update({ turn: restoredIndex });
  }

  function logCombatResult({ combat, currentSnapshot, cfg, stage }) {
    const refreshedCombat = game.combats?.get(combat.id) ?? combat;
    const currentAfter = refreshedCombat.combatant;

    console.log(`[ZFT] ✅ v${cfg.version} | ${stage} without combat reset`, {
      combatId: refreshedCombat.id,
      roundBefore: currentSnapshot.round,
      roundAfter: refreshedCombat.round,
      turnBefore: currentSnapshot.turn,
      turnAfter: refreshedCombat.turn,
      combatantBefore: currentSnapshot.combatantId,
      combatantAfter: currentAfter?.id ?? null,
      sameCurrentCombatant: currentSnapshot.combatantId === (currentAfter?.id ?? null),
      updatedOrder: refreshedCombat.turns?.map((combatant) => ({
        id: combatant.id,
        name: combatant.name,
        initiative: combatant.initiative
      })) ?? []
    });
  }
})();