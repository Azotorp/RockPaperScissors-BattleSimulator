# Swarm Arena · Phase 2 test build 1

This release includes the Phase 1 Classic theme and the Phase 2 simulation. The feature branch is `feature/swarm-arena-phase-2` in `Azotorp/RockPaperScissorsBattle`. The GitHub commit identifies the source and downloadable archive. The release introduces no runtime dependencies. The original main-branch baseline is `fef8bfcec10d00a1dfa97663313c16969e675db7`.

## Gameplay and timing

RPS and RPSLS retain the directed matchups used by the rules diagram. Each species has its own AI and perception settings per mode. Unlimited awareness discovers edible targets anywhere in the simulation. Limited awareness accepts candidates in the forward sight cone or the omnidirectional hearing radius. The arena contains no sight-blocking obstacles. Immediate danger preempts pursuit. Outside that danger radius an RPS creature keeps hunting. Disabling AI stops voluntary movement. The body continues to participate in physics.

The search uses the existing per-species k-d tree design with immutable position snapshots and in-place median partitioning. Queries prune by distance while testing eligibility during traversal. Wrapped worlds also search relevant neighboring images. The nearest result is exact for that decision snapshot. Position snapshots refresh on the decision interval and after structural changes. Entities are assigned different decision slots. Valid prey stays selected until the candidate improves distance by the configured percentage. Loss of perception, transformation, removal or teleport invalidates the commitment. An invalid target can trigger an early decision. Zombie fixation delays elective switches. New agents can wait up to one decision interval to acquire their first target.

Steering chooses one intent, then turns toward it at a bounded angular rate. Wandering retains its heading for a random interval. Walls suppress the outward component at the edge. Random crowd scouting was retired. All behavior and infection timers use simulation time. Pause stops those clocks. Each physics step advances exactly 1/60 s. The requested speed is subject to a step limit and a wall-clock catch-up budget. A slow device advances fewer simulation seconds per real second.

| State | Entry and exit |
|---|---|
| H | A human wanders when calm. Direct detection or a nearby directly frightened human can trigger fear. |
| Hs | A frightened human flees, drains stamina and can rest. Fear expires after the last qualifying warning. A secondary warning cannot initiate another chain of warnings. |
| Hi | Accumulated zombie contact reaches the threshold. The human remains in the human population through incubation and is excluded from new prey selections. |
| Zi | A zombie rests until its idle timer expires or a permitted detection interrupts it. Unlimited awareness permits immediate target acquisition on its next decision. |
| Zh | A zombie searches after resting or starts tracking newly detected prey. A timed search without prey leads back to idle. |
| Zc | A zombie sustains contact with its target through the initial tracking interval and pursues it. Losing the target returns it to search. |
| Za | A qualifying bite takes priority and briefly holds the attack expression after contact. The base Z artwork remains available as a fallback. |

A human carries partial exposure across encounters. The default threshold is **1,000 ms**. Crossing it starts **10,000 ms** of incubation. Every completed **1,000 ms** of subsequent contact subtracts another **1,000 ms**, in addition to ordinary simulation time. Each human receives the union of contact intervals from all zombies in a tick. A physical contact contributes for its fixed step, with geometric swept intervals catching crossings. A held bite lasts while the p2 contact or the short contact tolerance qualifies. The seed brush intentionally creates or converts patient zero immediately. A disabled zombie can be pushed but does not initiate a bite.

## Initial distribution, boundaries and camera

The seed is hashed with 32-bit FNV-style mixing over Unicode code points and expanded with Mulberry32. This stream is used exclusively for initial placement. Distribution version 1 selects a grid with enough cells to contain the requested species counts, shuffles cell and species orders with Fisher–Yates, and applies bounded jitter within each chosen cell. Each center is at least half the required separation from its cell edges. This provides minimum separation equal to the physics diameter plus the configured gap, including across opposite wrap edges. The uniform-grid option uses the same selection with zero jitter.

Reusing a seed reproduces the initial coordinates and types for the same viewport, bounds, physics radius, counts, gap, distribution algorithm and mode. AI randomness and later physics can produce different outcomes. Random seed mode generates a fresh seed per round. A capacity error reports the maximum for the chosen rectangular layout. Increase arena size, reduce gap or request fewer creatures. The total round limit is 15,000. Large restarts retire old bodies and construct new entities in batches. A newer restart supersedes an unfinished one.

World bounds are established at round creation from the viewport and arena multiplier. Outbreak also uses its extent multiplier. Walls and portals track that fixed world rectangle as the camera moves. In unbounded mode the rectangle only describes the initial placement area. The Phase 1 metric calibration remains 20 world units per 0.48 m by default. Speed controls use world units/s. Perception and threat ranges use current head widths. Spawn gaps use world units. Markers and wall thickness use screen pixels. Changing the head-size setting changes body radius and head-relative ranges while preserving world coordinates and metric calibration.

Both touch input paths capture the starting zoom, separation and world point under the midpoint. Scaling uses the current separation divided by the starting separation. Camera translation keeps that world point below the moving midpoint. Dragging, following or zooming does not move the arena. A huge screen-space hit radius now switches to scanning occupied actors when enumerating empty hash cells would cost more. Wrap teleports reset sweep history. Far zoom also batches crosshairs by species and collapses coincident same-color markers. Zoom-out uses the larger of 0.00001 and viewport long edge divided by 2²¹ physics radii. This limits view span relative to p2's Float32 position precision. Placement outside that precision range is rejected.

## Preferences and migration

The existing localStorage key `swarmArena.preferences` uses schema 3. Versions 1 and 2 migrate on load. Previously saved Outbreak sight angle, sight range and hearing range seed both human and zombie per-species settings. Retired scouting fields are removed. Current local records keep valid fields and recover defaults individually for out-of-range fields. A malformed record or unknown future version remains protected from ordinary writes. Portable imports validate before applying. Camera pan/zoom, selected mode, pick and brush retain their Phase 1 paths. Run state, scores and player histories are outside the preferences record.

All abbreviated paths below start with `modes.MODE.`. Existing settings retain their UI defaults. Exact types, bounds and steps are in `sim/options.js` and `ui/settings.js`.

| Setting keys | Default |
|---|---|
| ai.SPECIES.enabled / fov | Enabled. FOV limited for humans and zombies, unlimited for RPSLS species |
| ai.SPECIES.angle / sight / hearing | 90°, 5 head widths, 4 head widths |
| wanderMin / wanderMax / turnRate | 500 ms, 5,000 ms, 360°/s |
| threat / retarget | 2.5 head widths, 25% distance improvement |
| spreadFear / fearDuration / panicRange | Enabled, 4,000 ms, 4 head widths |
| idleMin / idleMax / idleInterrupt | 1,000 ms, 10,000 ms, enabled |
| huntTime / acquire / attackHold | 3,200 ms, 250 ms, 180 ms |
| threshold / incubation / bonusInterval / bonus | 1,000 / 10,000 / 1,000 / 1,000 ms |
| maxSteps / frameBudget / aiInterval | 32 steps, 10 ms catch-up budget, 4 steps per decision cycle |
| seedMode / seed / distribution | Random each round, fixed-seed text “swarm”, jittered grid |
| arenaScale / gap / initialZombies | 1×, 2 world units, 0 zombies |
| count.SPECIES / inspect | −1 inherits shared RPS population, inspector off |

Seed, distribution, initial population/mix, gap and arena extent take effect next round. Timings apply to the next corresponding transition or interval. The initial stamina preference applies when a human is initialized. Camera, overlays, visibility and movement settings update during play. Section reset, export/import and local-data clear reuse the Phase 1 storage service.

## Verification

| Coverage | Executable check | Result |
|---|---|---|
| Manifest, fixtures, resources and path validation | theme_registry.py | Passed |
| Seed, counts, torus spacing, capacity, incubation; 1,400 FOV/unlimited nearest comparisons against brute force | simulation_core.js | Passed |
| Desktop input, touch and pointer fallback, 3× → 6× → 3× pinch, midpoint anchoring, cancel and saved zoom | input_smoke.py | Passed |
| Fatigue, recovery, time limit, HUD and spawn controls | gameplay_smoke.py | Passed |
| Solid contacts, swept conversions, crosshair zoom and replay camera | physics_zoom_smoke.py | Passed |
| 480/600-actor CPU regression with test doubles | performance_smoke.py | Passed |
| Real WebGL and p2 startup, persisted browser profile, per-mode isolation, storage failures and reset/import/export | visual_phase1.py | Passed |
| Real animated fixture, static sprites, fallback, actor composition, fixed diagram and mobile access | theme_render.py | Passed |
| 3/5-type matchups, threat priority, all Outbreak states, overlapping/interrupted contacts, settings round trip, migration and seeds | phase2_gameplay.py | Passed |
| Real p2 separation while biting, contact release, repeated restart, extreme zoom hit testing and wrap transfer | phase2_real.py | Passed |

The Python executables are in `tests/`. Run each with Python. Run the JS test with Node. `python tools/build_themes.py` regenerates the ready-to-serve theme registry.

## Performance and limits

Real Chromium Headless Shell 153.0.8010.0, software WebGL (SwiftShader), Linux x86-64, Intel Xeon Platinum 8573C. The benchmark runs RPSLS at 1200 × 760 with seed “bench-v1”, 1× requested time, three maximum steps per frame and a 10 ms catch-up budget. The arena multipliers are 1.5, 3.25 and 4.5. The camera fits the whole arena. It measures 45 animation-frame intervals per population after eight warm-up frames. The timings below are milliseconds; the per-step columns are means. Heap refers to JavaScript heap at the sample point.

| Actors | Build ms | Median frame | P95 frame | AI/step | p2/step | Contact rules/step | Transform sync/step | JS heap MiB |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 729.0 | 66.7 | 199.9 | 3.8 | 1.9 | 3.1 | 0.6 | 29.6 |
| 5,000 | 1603.1 | 66.7 | 300.0 | 23.0 | 11.9 | 18.5 | 3.2 | 67.3 |
| 10,000 | 763.5 | 133.3 | 183.3 | 50.2 | 35.7 | 34.3 | 6.5 | 116.9 |

At 10,000 actors the median was about 7.5 displayed frames/s. This is a stress-test population on this machine. AI, contacts and p2 all consume substantial CPU. A fixed step may exceed the catch-up budget by itself. Offscreen creatures keep simulating. Browser scheduling, garbage collection and software rendering also affect frame intervals. GPU memory and garbage-collection time were not isolated. Touch automation used Chromium emulation; physical Android Chrome, iOS Safari and hardware-GPU performance remain unverified.

To repeat, run `python tests/benchmark_phase2.py` with the same browser and library settings as the real-engine tests. For a density rejection, try 15,000 creatures per type in a 1× arena. For the high-load case, use RPSLS, 2,000 per species and a 4.5× arena.

## Manual smoke test

1. On desktop, start Classic RPS, select a winner, then press GO. Check pursuit, urgent escapes, conversions and the selected HUD entry. Switch to RPSLS and check the five entries and ten directed rules.
2. In Spawning, choose a fixed seed and New round twice. Compare the ready layouts. Change one species count and confirm the next round uses it. Ask for 15,000 of each type and verify the visible capacity or total-limit message. Restore the previous counts.
3. In Outbreak, set one starting zombie and start a new round. Expand the state legend and focus a human. Watch exposure across contacts, the infected countdown and the eventual population transfer. Pause and resume during incubation.
4. Switch among solid, wrap and unbounded worlds. Pan away, zoom out, switch head size and return via Fit view. Check the fixed wall location and the signed metric coordinates. Try repeated New round while a large population is still preparing.
5. On a touchscreen, start at a non-default zoom, spread two fingers, lift and pinch again. Translate both fingers together. Confirm the midpoint remains anchored and releasing the final finger does not spawn an actor. Refresh and check saved zoom.
6. Set independently different perception options in two modes, close and reopen the browser, then export, change and import settings. Check the original values in each mode and use the requested category reset.

## Changed source and Phase 3 entry points

The gameplay integration, camera, lifecycle, counters and profiling hooks are in `main.js`. The testable search, spawn and infection helpers are in `sim/core.js`. The settings definitions and UI are in `sim/options.js`, `ui/settings.js`, `ui/settings-window.js`, `index.html` and `ui/window.css`. World-space boundary drawing is in `ui/arena.js`. The cPanel deployment includes `sim/`. Tests and the benchmark are under `tests/`.

Classic is the only production theme. Phase 3 can add a directory and validated manifest under `assets/themes/`, then regenerate the registry. Existing semantic appearance IDs cover all three modes and the seven Outbreak states. The game retains regular sprites for single frames and the animation path for multi-frame entries. See the [manifest schema](theme.schema.json) and [theme handoff](PHASE-2-HANDOFF.md).
