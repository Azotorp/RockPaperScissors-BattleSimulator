# Phase 1 release

Built from Azotorp/RockPaperScissorsBattle main at fef8bfcec10d00a1dfa97663313c16969e675db7. This package can be served directly. Installation and test commands are in the README.

- Classic is the installed default. It includes all five original RPSLS images, both original human expressions, the original zombie and four new expression edits. The eight original files passed byte-for-byte comparison against Git.
- The population HUD uses real counts and percentages, a complete selected-entry outline and independently adjustable opacities. The three HUD widgets have independent reveal controls. The top-right Settings button remains reachable with transparent or collapsed widgets.
- The diagram uses the original directed outcome rules with sprite nodes. Its opacity is isolated below the actors. The metric grid, beveled walls and paired wrap edges have their own screen-space rendering layer.
- Settings are validated, applied to the live UI and stored by mode. The storage manager supports grouped views, reset, clear, import and export. Rounds still begin fresh.
- The state preview includes the full expression set. Production Outbreak state counts display a dash until a caller supplies data. Phase 2 owns those counts and behavior transitions.

## Checks run

| Check | Result |
|---|---|
| Registry build, fixture discovery and invalid-resource tests | Passed |
| Node syntax checks for main, UI modules and generated registry | Passed |
| Original desktop and emulated touch input suite | Passed |
| Original human fatigue, timer and HUD tests | Passed |
| Original contacts, swept collisions, zoom and replay regression tests | Passed |
| Original mocked performance smoke | Passed, 480 and 600 actors for 24 test frames |
| Real PixiJS/p2 launch, transparent composition and artwork loading | Passed in Chromium Headless Shell 153 using software WebGL |
| Real two-frame fixture, static sprite class, live theme replacement and fallback | Passed |
| Fixed-size 3/5-mode diagrams, directed edge counts, pixel comparison under an actor, zoom extremes and bounded grid spacing | Passed |
| Browser process close/restart with the same profile, per-mode settings, selected winner and 0/100% transparency | Passed |
| Same-origin two-tab changes, settings export/import, invalid data, reset and clear with an unrelated key present | Passed |
| Older-schema rename, future version, corrupted JSON, denied access and quota failure | Passed |
| Narrow viewport, touch reveal and independently reachable Settings | Passed |

The four legacy smoke tests use Pixi/p2 doubles. The two new browser integration suites run the pinned production libraries. Runtime scripts were served from cached copies of the exact CDN versions during testing. No physical phone, hardware GPU benchmark, or production deployment was part of this verification.

## Preview files

- [Classic face comparison](classic-contact-sheet.png)
- [Three-type arena](previews/classic-arena.png)
- [Five-type arena](previews/five-type-arena.png)
- [Installed-state preview](previews/state-preview.png)
