# Project Status

Status verified November 22, 2026, America/New_York. This document owns current development status on `develop`.

| Field | Status |
| --- | --- |
| Repository | `LuvacZantor/zft-round-initiative` |
| Active development | `develop`; the commit containing this checkpoint includes the complete dev.6 runtime |
| Original parent | `main` commit `251a1dbe3e3aedd179b17d7582db183949cb840d`, initial README and MIT LICENSE |
| Exact source checkpoint | Resolve the containing commit or inspect [develop history](https://github.com/LuvacZantor/zft-round-initiative/commits/develop); verify the live branch HEAD before resuming |
| Module | `zft-round-initiative` / `13.0.0-dev.6` |
| Target | Foundry V13 / D&D5e, explicitly requested November 22, 2026 |
| Evidence | Locally validated: 96/96 tests; complete ZIP/extracted tests passed. Browser rendering and live Foundry acceptance pending |
| Actual live versions | Not inspected; record core/system/Midi-QOL/Carousel/Tools versions during testing |
| Current delivered artifact | [Exact dev.6 ZIP](https://github.com/LuvacZantor/zft-round-initiative/blob/develop/artifacts/zft-round-initiative-v13.0.0-dev.6.zip), SHA-256 `fa4d89ffc50ec8fd7e3415b4dcd9c0bea594c86a7f8023e6d3d89f7f0691afa7` |
| Rollback | [Exact dev.5 ZIP](https://github.com/LuvacZantor/zft-round-initiative/blob/develop/artifacts/zft-round-initiative-v13.0.0-dev.5.zip). No accepted stable release; disabling the module returns to the prior workflow |
| Branches | `develop` contains development source; `main` remains the initial README/LICENSE checkpoint |
| Remote scope | Owner authorized this development checkpoint. No main update, merge, tag, release, or deployment |
| Pause / next action | Work paused at owner request. Test dev.6 in the intended V13 world; queue findings before another runtime build |
| Next runtime version | `13.0.0-dev.7` if further runtime changes are requested |

## Continuation

Read the [handoff](docs/DEVELOPMENT_HANDOFF.md), [acceptance plan](docs/TESTING.md), [changelog](CHANGELOG.md), and [artifact inventory](https://github.com/LuvacZantor/zft-round-initiative/blob/develop/artifacts/README.md). [Original build evidence](docs/validation/build.json) records the historical pre-commit build, not current remote state. [Checkpoint evidence](docs/validation/repository-checkpoint.json) records preservation and validation for this repository save.

Owner screenshot comparison shows dev.5 character rows approximately match pre-module row height. Dev.6 only compacts this module's top control strip; no native row, portrait, timing-label or effect sizing changed. Actual Foundry CSS measurements remain pending because local Chromium could not launch.

Movement-history testing is deferred by the owner. No explicit movement-clearing behavior was added. Preserve manual Request/Begin/Restore/Make Current behavior and the existing schema/settings.

Preserve original macros and MIT license verbatim, native Combat/Combatant IDs, Actor data, turn integrations, and GM-only world history journals. The user advances rounds through native Foundry controls; module actions do not change `Combat.round` or the world clock. No world data is stored in this repository checkpoint.
