# Dev.5 GPU perception, culling and simulation detail

The [swarm prototype](lab/) supports RPS and RPSLS prey masks, solid walls, paired portals, unlimited awareness, and directional sight with omnidirectional hearing. Exact pursuit uses identical simulation settings at all camera sizes. GPU workgroups compact visible agent IDs and issue an indirect point draw. The CPU renderer uses the same centered view. The main battle skips invisible sprite animation, subpixel perception overlays, and repeated per-candidate cone trigonometry.

Massive mode is opt-in. It refreshes distant targets every four or eight ticks, continues movement every tick, and drops cone restrictions for sufficiently tiny agents. Detail switches below 0.75 pixels and returns above one pixel. This setting can change outcomes. Lab controls are stored with dev preferences and included in export, import and reset.

## Verification

1,696 CPU target results matched a separate brute-force implementation for both RPS variants, both boundary modes and both FOV settings. Exact CPU snapshots matched across two zooms. Actual WebGPU matched CPU targets over twelve fixed steps in five configurations. Rendering, device loss and missing-adapter fallback passed. CPU circle sweeps, both main-game solvers, Classic/RPSLS, Outbreak, camera, resize and browser viewport checks passed.

[GPU screenshot](tests/previews/gpu-pursuit.png)

## Population and visibility matrix

Chrome Headless Shell 151 on Linux x86-64, Intel Xeon Platinum 8573C and SwiftShader WebGPU. Each scenario ran the CPU and GPU reference from the same deterministic positions. The concentrated scene fits the agents into the central 9% of world area. The offscreen view shows 1/16 of the world area. Directional uses five species. Massive uses paired portals, directional sensing, 4× zoom and a four-tick distant decision interval. These measure pursuit and movement. The full contact/conversion rules run in the main CPU game.

Each individual stage below has one timed sample after warmup. Combined is a separately fenced simulation-plus-draw sample, independent of browser refresh. Snapshot transfer is for validation. Allocation is explicit GPU buffer space and excludes driver overhead. Invalid checks cover population IDs, finite coordinates and target index range. Times are milliseconds. See `python dev/tests/benchmark_lab.py`.

| Agents | Scenario | CPU step | GPU step | Draw | Combined | Init | Snapshot | GPU MiB | Invalid / target differences |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | dispersed | 9.5 | 4.0 | 199.6 | 13.5 | 460.7 | 7.2 | 0.07 | 0 / 0 |
| 1,000 | mostly-offscreen | 3.5 | 3.7 | 125.9 | 5.4 | 301.0 | 3.8 | 0.07 | 0 / 0 |
| 1,000 | dense-cluster | 6.8 | 6.8 | 156.8 | 34.7 | 321.1 | 2.7 | 0.07 | 0 / 0 |
| 1,000 | portals | 2.1 | 5.3 | 216.0 | 15.1 | 256.8 | 9.4 | 0.07 | 0 / 0 |
| 1,000 | directional | 4.7 | 7.2 | 178.4 | 10.6 | 279.6 | 4.9 | 0.07 | 0 / 0 |
| 1,000 | massive | 20.7 | 2.7 | 134.3 | 12.9 | 369.0 | 6.5 | 0.07 | 0 / 0 |
| 10,000 | dispersed | 39.9 | 17.9 | 173.6 | 41.2 | 285.2 | 5.9 | 0.70 | 0 / 0 |
| 10,000 | mostly-offscreen | 16.0 | 15.3 | 125.6 | 28.2 | 226.3 | 8.5 | 0.70 | 0 / 0 |
| 10,000 | dense-cluster | 45.2 | 51.5 | 181.8 | 70.6 | 241.6 | 9.4 | 0.70 | 0 / 0 |
| 10,000 | portals | 21.5 | 14.4 | 132.7 | 31.3 | 244.2 | 2.9 | 0.70 | 0 / 0 |
| 10,000 | directional | 23.5 | 17.6 | 119.8 | 23.5 | 221.9 | 5.6 | 0.70 | 0 / 0 |
| 10,000 | massive | 9.1 | 12.2 | 126.0 | 21.6 | 223.5 | 2.7 | 0.70 | 0 / 0 |
| 100,000 | dispersed | 205.0 | 154.9 | 175.4 | 212.1 | 238.5 | 9.6 | 6.96 | 0 / 0 |
| 100,000 | mostly-offscreen | 189.3 | 161.8 | 145.3 | 172.5 | 221.8 | 14.5 | 6.96 | 0 / 0 |
| 100,000 | dense-cluster | 665.5 | 702.5 | 181.5 | 601.3 | 217.4 | 10.8 | 6.96 | 0 / 0 |
| 100,000 | portals | 200.3 | 153.2 | 167.8 | 200.6 | 219.2 | 22.8 | 6.96 | 0 / 0 |
| 100,000 | directional | 213.8 | 152.3 | 160.8 | 176.3 | 214.3 | 12.4 | 6.96 | 0 / 0 |
| 100,000 | massive | 106.6 | 107.2 | 138.1 | 130.6 | 219.6 | 8.9 | 6.96 | 0 / 0 |
| 1,000,000 | dispersed | 3396.3 | 1757.8 | 651.3 | 2049.1 | 597.3 | 283.9 | 69.62 | 0 / 0 |
| 1,000,000 | mostly-offscreen | 3854.6 | 1677.5 | 358.0 | 1968.6 | 288.3 | 242.4 | 69.62 | 0 / 0 |
| 1,000,000 | dense-cluster | 17247.0 | 7726.3 | 544.3 | 7257.7 | 451.9 | 285.6 | 69.62 | 0 / 0 |
| 1,000,000 | portals | 4070.5 | 1707.1 | 640.0 | 2054.1 | 326.8 | 275.6 | 69.62 | 0 / 0 |
| 1,000,000 | directional | 4158.5 | 1694.3 | 528.4 | 2086.9 | 321.7 | 271.1 | 69.62 | 0 / 0 |
| 1,000,000 | massive | 1411.7 | 1278.0 | 344.9 | 1302.2 | 324.6 | 244.7 | 69.62 | 0 / 0 |

## Remaining parity work

GPU physical contact resolution, simultaneous conversion ordering, complete Outbreak state and timer parity, and integration into full GPU battles remain open. The benchmark covers a dense pursuit cluster rather than dense combat. A hardware GPU and a physical mobile device remain untested. Files changed include the dev game and build, lab shaders and UI, dev preference handling, CPU collision/AI paths, benchmarks, and regression fixtures.
