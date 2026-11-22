# Historical dev.2 feedback

These requirements are implemented in the dev.3 candidate. Retained as historical context, not a pending queue.

### Queued owner feedback after dev.2 delivery

The owner clarified that Foundry already advances the round when the last combatant finishes; the separate End Round Notice button is redundant and mislabels the newly entered round as complete if clicked after that transition. The desired revision is an automatic, presentation-only preparation notice when the native round changes forward, followed by the owner's manual Request Initiative action.

- Observe the native previous/current round transition. For 1 -> 2, announce `Round 1 complete. Prepare for Round 2.` Never describe the new current round as already completed. Handle initial 0 -> 1 separately without announcing that Round 0 ended.
- Remove the separate End Round Notice control from compact and expanded views. Keep Request Initiative, Begin Round & Protect, Restore Current Round, History and expand/condense. Adjust the compact row accordingly.
- Automatic preparation announces only: do not clear rolls, roll NPCs, change the turn/round counter, or save/overwrite initiative snapshots on the transition.
- The owner then manually clicks Request Initiative. It retains the existing preparation/rolling behavior and its `Round 2: Roll Initiative` announcement. The actual roll request stays tied to that button; do not introduce a separate announcement button or automatic rerolls.
- After player rolls, Begin Round & Protect retains its existing immutable current-round starting snapshot and highest-initiative selection. Recovery remains during the current round, not an end-of-round snapshot.
- Validate first start, normal 1 -> 2 -> 3 transitions, backward changes, reloads, deleted/viewed combats, GM handoff and multiple clients. Only the authoritative GM broadcasts each transition once. Avoid stale delayed preparation notices overwriting a later manual roll request. No startup/reload replay of old completion notices.
- Review the existing public `endRound` API when removing the obsolete workflow. Do not silently redirect it into an initiative reset/roll action. Document any compatibility handling explicitly.

This is a queued revision; the dev.2 runtime and delivered ZIP remain unchanged until the next build is requested.

