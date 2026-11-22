# ZFT Round Initiative

Foundry V13 development build **13.0.0-dev.6**. D&D5e. Local tests only; live Foundry acceptance is pending. The owner explicitly selected V13 for the current campaign; V14 migration is separate.

Adds manual round announcements, protected starting initiative, current-round recovery, and GM history. The existing combat tracker and Combat Carousel continue to display Foundry's normal Combat/Combatant records. This module does not advance the round counter.

Dev.6 reduces the embedded strip to a 32px minimum with 24px inline action controls, avoiding inherited full-size button rules. Dev.5 restored compact per-combatant arrows and direct initiative editing; character-row styling is unchanged in dev.6. Automatic notices retain their eight-second default. Starting snapshots, recovery, history, encounter names and optional details-window preferences are preserved.

Development source: [`develop`](https://github.com/LuvacZantor/zft-round-initiative/tree/develop). Exact delivered packages and rollback: [artifacts](https://github.com/LuvacZantor/zft-round-initiative/blob/develop/artifacts/README.md). Work is paused pending live tests.

Current status and provenance: [PROJECT_STATUS.md](PROJECT_STATUS.md). Engineering continuation: [development handoff](docs/DEVELOPMENT_HANDOFF.md). Required acceptance checks: [testing](docs/TESTING.md). Central instructions: [ZFT standards](https://github.com/LuvacZantor/zft-standards/blob/main/PROJECT-INSTRUCTIONS.md).

## Install the test build

1. Use a backed-up or copied V13/D&D5e world for initial tests. Record the actual core, system, Midi-QOL and Carousel versions.
2. Extract `zft-round-initiative-v13.0.0-dev.6.zip` into Foundry's User Data `Data/modules/` directory. The result must be `Data/modules/zft-round-initiative/module.json`.
3. Enable **ZFT Round Initiative** in the world, then refresh GM and player clients.
4. Use the **Round Initiative** status strip and icon buttons directly beneath the existing combat tracker's round/settings header, above its combatant list. Turn Time keeps its own controls at the bottom. The docked sidebar and Foundry's own popped-out Encounter Tracker are supported. ZFT Tools and `game.zftRoundInitiative.open()` focus this embedded strip.

The strip stays outside the scrolling combatant list and shows the round and protection state plus Request Initiative, Begin Round & Protect, Restore Current Round, History and optional Details icons. Hover or keyboard-focus controls for effects and disabled reasons; focus the status for the full encounter name. History and Details open only on request. Details retains the earlier compact/expanded window and its per-client mode, position and width preferences. `game.zftRoundInitiative.openDetails()` explicitly opens it; `open()` falls back to Details only if the native tracker is unavailable.

There is no manifest installation URL or update/download declaration for this unpublished local build. ZFT Tools is optional; Cinematics, Carousel, Midi-QOL and libWrapper are not required dependencies.

## Round workflow

1. Play turns with the existing tracker/Carousel. When Foundry advances from Round 1 to Round 2, a short notice says **Round 1 Complete** and **Prepare for Round 2**. This announcement changes no initiative or turn/round counters. For the initial 0 -> 1 start it says Prepare for Round 1. You can still request the first initiative before native Start Combat, but Begin Round must wait until Foundry shows Round 1.
2. **Request Initiative** clears active players' owned combatants and rolls NPCs/unowned combatants with the native system formula. Players use their existing initiative controls. A brief, non-interactive centered notice requests rolls.
3. After the rolls are ready, **Begin Round & Protect** saves the current round's original initiative before selecting the highest initiative holder. Ties follow the native tracker order. Missing rolls are reported in the confirmation; the GM may explicitly proceed with them saved as unrolled.
4. Play with the existing tracker or Carousel. Foundry advances the round as normal when the last turn ends. The module observes that change and announces preparation for the new round.
5. You manually trigger Request Initiative when ready, then Begin Round & Protect after the new rolls. There is no separate End Round Notice button and no automatic rerolling.

Automatic preparation notices ignore reloads, backward changes, duplicate events and manual round-number jumps. A persisted marker and active-GM gate prevent repeated broadcasts; notice ordering prevents a late preparation message from replacing your manual roll request. Set **Automatic round preparation notices** off to disable this behavior while retaining manual roll notices. Global announcement and per-client visibility preferences also apply.

Do not run the old GM reset macro in addition to Request Initiative. The supplied original macros remain protected reference files under [docs/reference](docs/reference/README.md); the module does not create, replace or delete world Macro documents.

## Edit an initiative value

As the active GM, click a rolled initiative number in the existing tracker, type the replacement, and press **Enter** to save. **Escape or clicking away cancels**; there is no automatic save when a tracker redraw removes the input. Keyboard-focus the score and press Enter/Space to edit. Decimals such as `28.20`, zero and negatives are accepted; blank text, formulas and invalid values are refused. The current combatant stays selected through re-sorting. Native/third-party initiative inputs and unrolled die controls keep their existing behavior.

Before Begin Round, corrected values become part of the later starting snapshot. After protection, a manual edit shows **Changed** while the immutable starting snapshot remains available for Restore. Editing is GM-only and does not grant player editing permissions. A round/value/view change during editing refuses a stale save.

## Recover during the current round

Use **Restore Current Round** after a reset, reroll or unwanted initiative edit. It restores the protected values captured by Begin Round for the round Foundry currently shows. It keeps the combatant selected immediately before restoration by its stable combatant ID when that combatant still exists. If the mistake already moved the pointer, click the small **Make current combatant** arrow beside the intended entry before or after recovery. No canvas token selection is required; the current entry shows a disabled check icon. This action changes only the native turn pointer, leaves initiative and protected snapshots intact, and does not advance the round. It uses Combatant IDs to distinguish identically named NPCs. Only the active GM can perform it. The explicit API is `game.zftRoundInitiative.setCurrentCombatant(combatId, combatantId)`.

The starting snapshot stays unchanged throughout play. Another Begin or Request cannot overwrite/reset a protected current round. Recovery does not rewind rounds or actor data. Removed combatants are skipped; combatants added after the snapshot keep their current initiative. Existing Foundry tie sorting still applies; the saved history also records the original order.

A snapshot cannot recover rolls from before this module was enabled or from before Begin Round saved them. Native reset/roll controls are not intercepted; the recovery snapshot survives those changes. Histories from other rounds are view-only.

## History and presentation

**View Initiative History** lists each saved encounter and round. Private world JournalEntries hold versioned snapshots with no player permissions. History persists across refreshes, module reinstalls and combat deletion; it is not stored in the module directory. Do not delete or share the `Round Initiative:` journals if you want their records retained. The module refuses to use a history journal that has been shared with players.

Round notices are this module's small text overlay, visually informed by Cinematics. They do not call Cinematics, replace narration, play media or change scenes. Notices use native Combat flag replication, contain no hidden initiative records, and let pointer input pass through. Each client can turn notices off; the GM can disable broadcasts or set separate 2–12 second durations: automatic round transitions default to 8 seconds; manual Request/Begin notices retain the existing 4-second default and saved preference. A newer roll prompt replaces the preparation banner immediately. Existing `endRound` API calls now return false with a retirement warning and perform no mutation; they are never redirected to Request Initiative.

ZFT Tools uses its existing `zft-tools.collectTools` hook to add a launcher. The native tracker gets a separate module-owned strip and row buttons; Turn Time's existing controls and state remain owned by Turn Time. Carousel uses the same updated Combat records; no Carousel markup or undocumented API is patched. Refresh and turn-effect behavior still need live testing.

When Combat Log is active, encounter names are read from its existing `combatNames` setting using the stable combat ID. Initial names and later renames refresh the controls and history automatically, including history already saved with a generic name. The integration is read-only and optional. Without Combat Log, names fall back to the native combat name or saved history label. The original snapshot contents are never rewritten for a name change.

## Validation and rollback

Run `node --test tests/*.test.js` for the mocked state/permission/UI-context suite. For the current package, use the exact delivered ZIP under `artifacts/`. For a future changed build, increment the prerelease first, then run `python3 tools/build.py` with Node and Python 3.10+ to produce and validate the deterministic complete manual ZIP. Archived versions are guarded against reuse; `artifacts/` and local build output are excluded from new packages. `tools/browser-check.py` is an optional Playwright DOM simulation, not Foundry; it could not be launched in the build environment.

No live Foundry, Midi-QOL, Carousel or ZFT Tools compatibility is certified. In particular, test start/end-turn effects when initiative reorders or the active turn changes. There is no generic claim that a `Combat.turn` write bypasses such effects.

To roll back, restore the dev.5 package and refresh clients, or disable the module to return to the prior workflow. The snapshot schema is unchanged and dev.5 can still read saved records. Keep the GM history journals and world backup. The complete development source is checkpointed on `develop`. `main` still contains only the initial README/LICENSE commit. Exact delivered ZIPs and original receipts are retained under `artifacts/`; repository documentation updates do not rebuild or alter those packages.

Movement-history cleanup remains a deferred live test. This build adds no explicit movement clearing; normal V13 turn behavior still applies.
