# Development handoff

## Exact checkpoint

Runtime baseline: delivered dev.5 ZIP SHA-256 `05d7a2622d1a1c64c44dced01285c3417b9a284b6c617960e4c70ffff806827e`. Keep that package for test rollback; dev.6 compacts the embedded module controls.

Development source version `13.0.0-dev.6` is checkpointed on `develop`, preserving parent `main` commit `251a1dbe3e3aedd179b17d7582db183949cb840d`. The containing checkpoint commit is the current source checkpoint; verify live `develop` HEAD before further edits. `main` retains its initial README/LICENSE only. No merge, tag, release or deployment is part of this save. [Project Status](../PROJECT_STATUS.md) owns current development state.

Work is paused at the owner's request. The next action is live dev.6 testing, not another build. Exact dev.6 and dev.5 rollback ZIPs plus receipts are under [artifacts](https://github.com/LuvacZantor/zft-round-initiative/blob/develop/artifacts/README.md). Runtime, protected reference files, tests and settings are unchanged from delivered dev.6. Repository documentation and build-archive guards are checkpoint-only maintenance. A future runtime change uses `13.0.0-dev.7`; the build recipe refuses to overwrite an archived version. Historical `docs/validation/build.json` and archived ZIP handoffs retain their original pre-commit statements as evidence.

## Owner requirements

- Foundry V13 is explicitly selected. Do not switch this campaign to V14; migration and live acceptance are separate future work.
- GM retains manual controls. Foundry's native controls advance the round counter. This module never advances it.
- Do not build a tracker or replace Carousel. Operate on existing Combat/Combatant documents.
- Recovery is of the CURRENT round's STARTING initiative during play, including an accident three turns in. Baseline must be durable before the first combatant acts and cannot be replaced by later resets, edits, rerolls, or repeated Begin clicks.
- Restore values for existing IDs and keep the currently selected combatant by ID. The owner may manually choose the correct combatant if the accident already changed the pointer.
- Read-only encounter/round history; short centered prompts in the Cinematics visual direction. The first build uses its own pointer-transparent text notice to avoid interfering with the Cinematics shared presentation.
- Preserve supplied macro defaults: active non-GM owners roll; NPC/offline-owned actors are rolled by the GM with the native formula; defeated combatants are included by default; highest ties use tracker order.

## Implementation

`scripts/model.js` owns pure selection/snapshot/recovery planning. `store.js` uses one GM-only world JournalEntry per combat. `service.js` owns guarded manual actions, native rolling, immutable snapshots and pointer restoration. `ui.js` is V13 ApplicationV2 + Handlebars; controls and read-only history. `presentation.js` uses public Combat flags for short generic notices only. `tracker.js` supplies embedded native tracker controls; `main.js` wires lifecycle and the optional ZFT Tools hook. No sockets, libWrapper, new tracker, scene transition logic, Cinematics writes or player-side privileged execution.

Only the active GM can mutate state, enforced in the service and store. GM actions have a local busy guard and reject stale confirmations. A persisted collecting/failed state avoids repeated clearing after refresh or partial failure. Saved snapshots are rejected on attempted overwrite at the model and storage boundaries. A failed turn-pointer update leaves a recoverable snapshot and guarded Begin retry.

## Preservation and differences from original macros

Reference files under `docs/reference` are not runtime imports. Preserve their bytes/hashes. Runtime adds safety gates and GM privacy; it does not modify existing world Macro documents. Viewed native tracker combat is preferred over a different active combat. When NPC auto-roll is disabled, unowned initiative is explicitly cleared to pending instead of silently retaining an old roll. Players keep using the native tracker/Carousel; no new player rolling interface is introduced.

Never place full history in public Combat flags or ordinary chat. No automatic history purge, journal reseeding, actor/item/effect mutation, or combatant delete/recreate. Journals survive deleted combats and module upgrades. Sharing a history journal makes it unusable until the owner removes player access.

## Validation boundary

State/model, ownership and UI-context tests run under Node with narrow Foundry mocks. This does not execute real Foundry renderers or turn hooks. Chromium could not launch because local socket creation was denied; browser layout/rendering and CSS parsing in a browser are NOT TESTED. The optional fixture remains in `tools/browser-check.py` for another development environment. Check the test count and archive inventory in `docs/validation/build.json`.

Live acceptance must cover V13 core/system versions, GM/player clients, actual ZFT Tools installed version, actual Combat Carousel package/version, Midi-QOL and start/end-turn effects, tracker redraw/popout, keyboard/focus/resize/zoom and player announcement display. Do not claim compatibility from a manifest declaration.

## Continue

### Dev.2 corrections implemented

- Compact controls default to a 284px window: short encounter/round/protection status and one six-button row (five actions plus expand/condense). Hover and focus tooltips describe actions and disabled reasons. Expanded mode retains labeled controls and help. Per-client settings remember mode, position and expanded width. Position is clamped to the viewport.
- The existing tracker receives one 34px launcher row containing a small icon button, isolating it from direct-child button stretching. Popout and Tools access remain available.
- `scripts/names.js` reads Combat Log's existing encounter-name setting by combat ID when that optional module is active. Controls and history resolve the latest name on render, and a targeted updateSetting hook refreshes them after naming/renaming. Native and stored-name fallbacks remain available. Reading names does not mutate source settings or protected snapshots.
- `scripts/layout.js` supplies pure preference/position rules. `scripts/tooltips.js` handles keyboard/pointer tooltip lifecycle. In dev.2 the gameplay model, rolling/recovery service and notices were byte-identical to dev.1. Dev.3 changes notice timing/metadata and retires the old end-notice action as documented below; snapshot/recovery rules remain intact.
- The prior requirements are retained in [historical feedback](history/dev1-feedback.md). There is no remaining queued item from that list; live acceptance remains pending.

### Dev.3 round-transition workflow

- `scripts/transitions.js` watches native `updateCombat` round changes using a round cache seeded at ready on all clients. Normal forward transitions announce the OLD round completed and prepare for the NEW round. First 0 -> 1 says Prepare for Round 1. Rewinds, manual jumps and unknown/reloaded prior states do not fabricate completion notices. No observer calls native advance/turn/roll methods or writes initiative/history.
- Only the active GM publishes. The public transition marker and generic notice are written in one Combat update; the publisher serializes writes per combat, rechecks current document/round/GM, and suppresses stale preparation once manual rolls or Begin were announced. The marker prevents repeated broadcast on duplicate events/GM handoff.
- Manual Request Initiative still clears player-owned rolls and rolls NPC/unowned combatants, then publishes Roll Initiative. Begin Round & Protect still locks the current round's starting initiative and selects its highest holder. Restore remains current-round, preserving the selected combatant by ID. Snapshot schema stays 1.
- Removed End Round Notice from compact/expanded UI. Four actions plus expand/condense remain. The old public `endRound` API is retained as an active-GM-only warning/no-op returning false. It never redirects to rerolling or changes records. Old persisted ended-phase metadata remains readable without migration.
- The `autoRoundNotices` world setting defaults on; global announcements and per-client visibility remain respected. Persisted transition notices are never replayed at ready. Client presentation also rejects older notices and notices from a different current round.
- All queued dev.2 items are addressed in the candidate. Live Foundry acceptance remains pending. Original feedback: [dev.2 history](history/dev2-feedback.md).

### Dev.4 corrections implemented

- `scripts/tracker.js` embeds a compact status strip with Request, Begin & Protect, Restore, History and optional Details icons in the existing Combat Tracker. Placement follows Turn Time's sibling-after-native-controls pattern, with footer/root fallbacks. It never modifies Turn Time's nodes, classes or state and has no Turn Time dependency.
- Small GM-only per-combatant controls live inside each native `.combatant-controls` host. They use the row's Combatant ID and tracker application's `viewed` combat, not selected tokens, names or a cached sort index. `RoundService.setCurrent` resolves the current sorted index and makes only a native `{ turn: index }` update. An already-current row is a no-op; missing/unstarted entries, inactive GMs, concurrent actions, detached roots and stale views are guarded.
- Docked and native popped-out tracker instances are managed separately. Native renders remount owned nodes idempotently with AbortController/tooltip cleanup. Document/name/action updates refresh only the owned controls, retain focus and do not force native tracker polling. Native tracker close hooks remove listeners and references. Group rows without a real combatant/control host are left untouched.
- Public `open()` and ZFT Tools access now focus the existing embedded strip. Details opens the preserved compact/expanded window only on explicit request, or as an API fallback if a native tracker is unavailable. Existing client layout preferences remain intact. Details opened from a tracker is bound to that encounter ID. New optional APIs: `openDetails(combatId)` and `setCurrentCombatant(combatId, combatantId)`; previous APIs remain available.
- `scripts/control-state.js` shares the preexisting status/action/disabled-reason logic between the embedded controls and optional details. History privacy, schema, immutable snapshots and recovery semantics are unchanged. `model.js`, `store.js`, `names.js`, `layout.js`, `tooltips.js`, `transitions.js` and both protected macro files remain byte-identical to the delivered dev.3 archive.
- New world setting `transitionNoticeDuration` defaults to 8 seconds (2–12 configurable). Existing `noticeDuration` retains the 4-second default and all saved manual-notice preferences. No settings migration or overwrites. Newer manual prompts immediately replace longer preparation banners, with existing serialization/deduplication guards retained.
- All post-dev.3 queued items are implemented in this candidate; see [the original feedback](history/dev3-feedback.md). This is local validation only. Browser layout and real Foundry/Turn Time/Midi-QOL/Carousel acceptance remain pending.

### Dev.5 corrections implemented

- The existing strip is now inserted directly after the native V13 header part / combat-tracker header, before the combatant list. If the header is unavailable it uses a sibling before the native tracker/list part, then a top-of-content fallback. It remains outside the scrolling list, supports both native tracker forms and never moves Turn Time's footer controls. Native partial renders remain idempotent and stale actions remain guarded.
- Make Current is now an inline anchor with button semantics, tooltip, visible focus, explicit Enter/Space activation and aria-disabled/current states. Its wrapper and icon are constrained to 18x20px, avoiding inherited full-size button styling that made the owner's rows tall. This is a local implementation correction; actual Foundry pixel height still requires live acceptance.
- `scripts/initiative-editor.js` mounts an active-GM click/keyboard editor on rolled numeric labels only. Native/third-party inputs or interactive controls and unrolled die controls are preserved. Enter saves; Escape or clicking away cancels. Blur and native teardown never auto-save. Original native nodes are retained/restored, event listeners are cleaned up, and source text from a partial remount cannot overwrite the displayed current document value.
- `scripts/initiative-value.js` validates finite decimal values including zero and negatives; blank/invalid text never becomes zero. No D&D5e DEX tie-break recalculation, rounding or formula evaluation is added. The native V13 `Combat.setInitiative(id, value)` API preserves the current combatant while sorting. `RoundService.editInitiative` shares active-GM/busy guards and rechecks document identity, round and original initiative immediately before the native update. Protected starting snapshots and history are never written by editing, and Restore still recovers their original values.
- Input events are isolated from the native row/canvas actions and native change handler to avoid duplicate writes or unintended token panning. Each editor is scoped to its own tracker combat and Combatant ID. Existing settings, eight-second automatic notices, original macros, APIs, recovery and schema remain unchanged. No code from the GPL Player Initiative reference was copied and no dependency was added.
- The original post-dev.4 findings are archived in [dev.4 feedback](history/dev4-feedback.md). All three UI requests are implemented in this local candidate; real Foundry layout, CSS cascade, keyboard and integration acceptance remain pending.

### Deferred movement-history check

The owner will test movement cleanup later. Core V13 clears the incoming token's history at turn start. This build adds no explicit clearing and makes no claim that Begin triggers cleanup in every same-first-combatant scenario. Keep the existing Request/Begin/Restore/Make Current behavior; do not clear all token histories or add erasure to recovery/selection based on an unconfirmed hypothesis. The read-only before/after procedure remains in [TESTING.md](TESTING.md) and [original feedback](history/dev4-feedback.md).

Review the owner's live findings. Any runtime change after delivery increments the prerelease. Build with `python3 tools/build.py`; tests must also pass from the extracted ZIP. Preserve immutable source hashes in `docs/reference/provenance.json`. GitHub writes, branch creation, promotion and release each require the owner's exact task-specific approval under current central standards.

### Dev.6 embedded-control sizing

- The owner asked to compare character-row height and fix the large module controls. Latest dev.5 screenshot versus the pre-module screenshot shows approximately the original row pitch; the enlarged dev.4 arrow-button box is gone. Preserve native row/timing/effects/portrait dimensions.
- Only `tracker.js` and the embedded-strip rules in `round-initiative.css` change behavior: all strip actions now use inline anchors with button semantics and explicit Enter/Space activation, matching the successful row-control approach. Strip minimum is 32px, controls/wrappers 24x24px, gap 3px, vertical padding 3px. Group width stays bounded; status can wrap at narrow widths. No global styles or `!important` were added.
- Click/keyboard disabled guards, accessible names, focus, tooltip and active-GM/stale-view handling are retained. Tests cover keyboard History/Details and inert disabled Restore. The optional browser fixture checks row height versus its baseline, strip/control dimensions under oversized button rules, and narrow widths. Chromium launch still fails with a local socket permission error; these browser checks are NOT TESTED.
- Apart from the version constant, runtime files other than `tracker.js` and CSS are byte-identical to the delivered dev.5 ZIP. Original reference hashes and license are preserved. No state/schema/settings/initiative/recovery changes. See [original dev.5 feedback](history/dev5-feedback.md).
