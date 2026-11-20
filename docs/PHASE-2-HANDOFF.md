# Swarm Arena Phase 2 handoff

This document records the Phase 1 interface delivered to Phase 2. The [Phase 2 release notes](PHASE-2-RELEASE.md) describe the active schema, fixed round bounds, live state counts and simulation.

## Boot and ownership

The game remains a static site. The checked-in registry, settings service and presentation scripts load before the pinned PixiJS 8.23.0 and p2 0.7.1 scripts. The browser restores settings, stages a theme and starts a fresh simulation. Phase 2 supplies behavior state, counts and camera transforms. Theme manifests own images, orientation and palette. No entity positions, follow target, match clock, or in-progress round are written to storage.

## Theme registry and sprites

Use the Classic manifest as the example and `docs/theme.schema.json` for editor validation. Give a new theme its own folder under `assets/themes/` with the same ID as its manifest. Use a single trusted theme stylesheet, scoped to the arena. It can take over the original control layout as well as the variables consumed by `ui/window.css`. Bundle any local PNG and WOFF2 resources. Run `python tools/build_themes.py` after edits. The build checks paths, file types, existence, frame sizes, supported IDs and schema. It exits on errors. Deploy the generated registry and theme directories together. Only Classic ships.

`SwarmVisuals.resolveAppearance(themeId, species, visualState)` returns normalized frame URLs, size, normalized pivot, facing correction in degrees and FPS. Resources fall back to the requested state, then base species in the same theme, then the corresponding Classic state and base. A failed final texture load logs a diagnostic and produces a placeholder. Single frames use Pixi Sprite. Multiple equally sized frames use AnimatedSprite with shared textures. A switch stages the textures already needed, updates living sprites and the diagram, then releases unused textures. New behavioral state textures load on their first use.

| Species | State | Meaning |
|---|---|---|
| rock, paper, scissors, lizard, spock | R, P, Sc, L, Sp | Original species artwork |
| human | H, Hs, Hi | Calm, frightened, infected |
| zombie | Z, Zi, Zh, Zc, Za | Base, idle, hunting, chasing, attacking |

Call `SwarmVisuals.setVisualState(entity, id)` at a state transition. It returns a promise and rejects an ID from another species. Pass `null` to resume rendering the original game flags. A delayed texture load checks the entity still exists and belongs to the same species. Use the simulation's canonical species and keep PNG paths out of decision logic. State transitions should call the hook once. The existing scared-human highlight remains a separate overlay.

The selector is in Settings → Interface. State preview shows the installed artwork and sample legend alongside cache diagnostics. Current gameplay supplies actual species totals. Phase 2 should call `SwarmVisuals.setStateCounts({H, Hs, Hi, Zi, Zh, Zc, Za})` at HUD refreshes. Omitted values display a dash. Pass an empty object at the start of a round. `SwarmVisuals.updatePopulation({rock: n, paper: n, scissors: n}, selectedSpecies)` updates an already-mounted mode HUD. Its species entries are built on mode changes. Percentages have one decimal place. Name and border colors mix 25% and 50% black in sRGB. Theme manifests may provide accessible text and outline overrides.

## Camera, coordinates and stacking

Map/grid and boundary graphics use a viewport-sized Canvas 2D backing layer. A screen-positioned SVG renders the rules. The transparent Pixi canvas draws vision, actors and crosshairs above both. Interface components sit above the game. A diagram's opacity is independent of every Pixi actor. Call `SwarmVisuals.renderRulesDiagram(mode, rules)` with the mode ID and its species-to-prey arrays to redraw the diagram. Node orientation follows the first outgoing prey in the game's RPS3/RPS5 rules. All outgoing edges stay present. For each full frame canvas, the renderer rotates its four corners around its pivot and scales the largest axis extent to 40 diagram units. Animated frames use that same transform.

Call `SwarmVisuals.drawMap({x,y,zoom,width,height,metersPerWorldUnit,boundary,wallPx})` when the camera, viewport, boundary or map settings change. Width and height are CSS pixels. The screen position of world (0,0) is (x,y). Screen X grows right and screen Y grows down. Displayed Cartesian coordinates are ((screenX−x)/zoom, (y−screenY)/zoom) multiplied by metersPerWorldUnit. Grid steps follow the 1, 2, 5 sequence. Only visible lines are drawn. `SwarmVisuals.grid()` returns the chosen interval and screen spacing.

The old head-size control sets a full image width of max(8, longest viewport edge / headsAcross) world units and a physics radius of 0.44 of that width. **Phase 1 chooses a fixed metric calibration** of 20 world units to 0.48 m by default. That is one full default image width at a 1200-pixel reference edge and 60 heads across. That reference edge spans 28.8 m at 1×. Changing the artwork resolution, heads-across setting, viewport or camera zoom leaves the world scale intact. The physical circle diameter at the reference setting is 17.6 units. The shoulder-width assumption is adjustable in Settings. Phase 2 can pass its own explicit calibrated metersPerWorldUnit.

Boundary values retain the game's existing spellings `none`, `walls`, and `wrap`. A solid gradient draws inward along the viewport edges behind actors. Its 1–100 pixel width has no connection to the collision radius. Wrap edges pair top/bottom in orange and left/right in blue. Both boundary types follow the existing viewport-based world bounds.

## Browser settings and data

The service lives in `ui/settings.js` under `window.SwarmSettings`. Read with `getSetting(path)`, write with `setSetting(path,value)`, subscribe with `subscribe((paths,source)=>...)` and call `flush()` on commit. The subscription returns an unsubscribe function. Register new settings with defaults, bounds and type rules in the schema initialization before startup loading. New gameplay controls reuse `pathFor` and `modePath`. Keep new score records outside this schema.

The `swarmArena.preferences` localStorage key holds a JSON object with schemaVersion 2, an ISO lastUpdated and a flat preferences object. Dots are part of the key name. The shipped predecessor contains no localStorage preferences. The version-1 migration renames theme to theme.id and preserves validated values. An unavailable installed theme reverts to Classic on local load. Unknown versions and unreadable records are protected from ordinary writes. The Data & Storage page allows an explicit reset. Storage failures leave the active settings in memory and show a status warning.

| Path family | Contents |
|---|---|
| game.mode | 3, 5 or zombie, represented as strings |
| theme.id | Valid installed theme |
| modes.MODE | Game controls, population, boundary, wall width, diagram visibility/opacity, pick, brush |
| modes.MODE.camera | Screen-space translation x/y and zoom for that mode |
| modes.MODE.colors.SPECIES | A six-digit hex color or the theme default |
| hud | Panel state, content transparency, independent reveal/hide delays and Outbreak legend state |
| grid | Visibility, labels, calibration and optional color overrides |

A 100 ms debounce merges pending fields with the latest saved record. Web Locks serialize ordinary commits when available. On a storage event the other tab applies changed fields except those with pending local edits. The last commit to a given field wins. Camera translation and zoom form one field. Page hide and interaction commits flush pending changes. Browsers without Web Locks use a synchronous read/merge/write with best-effort conflict handling. The service has no cross-device persistence.

`resetSetting(prefix)` restores a category or individual field. `resetSetting()` restores all preferences. `exportSettings()` returns a portable JSON settings envelope, including effective defaults. `importSettings(text)` validates the entire document before replacing preferences. `clearAll()` deletes only owned records. The Data & Storage UI confirms destructive actions and reapplies the live values. Persistence is specific to the same browser profile and site origin. Private browsing or clearing site data can discard it.

**Future structured data adapter.** Reserve the IndexedDB database `swarmArena.records` for opt-in larger data. When a feature needs it, introduce an asynchronous adapter with get, put, delete, list-by-profile and clear-owned operations. Give run snapshots, profiles, score history and replays separate object stores and versioned upgrade transactions. Add the database to the clear-all confirmation and deletion operation when the first store ships. The current build opens no IndexedDB database. A settings export contains preferences only.

## Validation and release

Run the commands in the README. The browser suite covers original gameplay, input, camera retention and LOD, plus real WebGL composition and persistence. The temporary fixture verifies a second theme, animation and switching without packaging an extra theme. Keep those checks when integrating Phase 2. Preview images and the asset inventory accompany this handoff. The current build has no whole-system performance guarantee. Touch checks used emulation and the release still needs device-specific checks if physical Safari or Android support must be certified.
