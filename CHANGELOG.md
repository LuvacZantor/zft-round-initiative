# Changelog

## Repository checkpoint, November 22, 2026

- Preserve complete dev.6 source, tests, original macros/license, exact dev.6 package and dev.5 rollback package on `develop`.
- Update development status, navigation and pause handoff. Keep original package receipts and pre-commit build evidence unchanged.
- Exclude archived artifacts/build output from future packages and refuse reuse of archived version numbers. No runtime/version/schema/settings change and no live-acceptance claim.

## 13.0.0-dev.6

- Compact the module-owned top strip from a 38px minimum to 32px, with 24x24px inline action controls and less padding. Preserve wrapping at narrow widths.
- Replace strip buttons with semantic inline controls to avoid inherited full-size button rules. Preserve labels, tooltips, Enter/Space activation, disabled/current states and existing action guards.
- Retain the dev.5 per-combatant arrow and native character row dimensions; screenshots show that the extra height from the earlier dev.4 button is gone. No native row/timing/effect layout is restyled.
- Gameplay, initiative editing, snapshots, history, settings, notices and original macros are unchanged. Local/extracted-ZIP tests only; real Foundry layout acceptance remains pending.

## 13.0.0-dev.5

- Move the initiative strip beneath the native round/settings header and outside the scrolling combatant list in docked/popped-out trackers.
- Replace the tall per-combatant button with a compact inline icon, retaining tooltip, keyboard access and disabled/current states.
- Add active-GM click-to-edit rolled initiative labels. Enter saves; Escape or clicking away cancels. Preserve native/third-party inputs and unrolled die controls.
- Use native V13 initiative assignment with finite-decimal validation, current-combatant preservation, stale edit protection and shared action locking. Edits leave protected starting snapshots/history intact.
- Preserve recovery, settings, automatic notices, original macros and public APIs. Movement-history testing is deferred; no explicit cleanup was added.
- Automated source/extracted-ZIP validation only. Real Foundry visual/turn-hook/integration acceptance remains pending.

## 13.0.0-dev.4

- Embed round/protection status, Request Initiative, Begin & Protect, Restore, History and optional Details controls in the existing tracker. Support docked and native popped-out trackers without replacing them.
- Add compact GM-only Make Current buttons beside combatants. Resolve the live sorted turn by Combatant ID, without token selection or initiative changes; guard stale views, permissions, missing entries and repeat/concurrent actions.
- Keep Turn Time controls untouched. Use only native Combat updates so existing tracker/Carousel/automation hooks receive changes.
- Focus embedded controls through ZFT Tools/public open API; retain the earlier window as optional Details with existing client preferences.
- Extend automatic round-preparation notices to 8 seconds by default with a separate adjustable setting; preserve manual notice duration and ordering.
- Preserve snapshots, current-round recovery, history, original macros and existing APIs. Automated source/extracted-ZIP checks only; live acceptance is pending.

## 13.0.0-dev.3

- Observe native round changes and automatically announce the previous round completed/preparation for the new round; initial start prepares Round 1 without claiming Round 0 ended.
- Keep initiative requests/rolling manual. Remove the separate End Round Notice button from compact and expanded controls.
- Deduplicate authoritative-GM broadcasts, suppress reload/rewind/manual-jump replay, order notices per combat, and reject stale client presentation updates.
- Retain the old `endRound` public API as a warning/no-op, never a reroll alias.
- Preserve compact controls, layout preferences, optional encounter-name integration, protected starting snapshots, current-round recovery and existing world history.
- Automated source/extracted-ZIP validation only; live Foundry visual/integration acceptance remains pending.

## 13.0.0-dev.2

- Compact control window by default, with a short encounter/round/protection status and one row of icon buttons.
- Pointer/keyboard tooltips describe each action and disabled reason; expand for labeled controls and help.
- Per-client remembered view mode, window position and expanded width, with viewport bounds checks.
- Small fixed-height tracker launcher row; preserve native tracker, popout and Tools access.
- Read-only optional Combat Log name lookup and refresh on initial naming/later renames, including saved history.
- Preserve existing snapshot schema, original macros, initiative rolling/recovery service and round-counter ownership.
- Live Foundry visual/integration acceptance remains pending.

## 13.0.0-dev.1

- First V13 local test build, based on the owner's soft reroll and highest-initiative macros.
- Manual Request Initiative, Begin Round & Protect, End Round Notice, and Restore Current Round.
- Immutable per-combat/per-round starting snapshots stored in GM-only world journals, with read-only history.
- Current-combatant ID preservation during recovery, participant-change handling, repeat/stale-action guards.
- Native tracker launcher, optional ZFT Tools launcher, and independent centered generic round notices.
- Owner advances rounds using Foundry's existing controls; no module round-counter changes.
- Local state/permission/UI-context tests and complete deterministic manual ZIP; live Foundry and browser layout tests pending.
