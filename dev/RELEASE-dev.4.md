# Dev.4 simulation backends

The main game defaults to a deterministic circle solver with a fixed step, a spatial hash, swept pair contacts and the existing gameplay state machine. Select the p2 comparison solver before starting a new round. Fixed round seeds now control simulation randomness as well as placement.

Open [GPU swarm prototype](lab/) from the dev controls for Auto, CPU or WebGPU. Its supported workload is 360° nearest-prey pursuit in a square solid arena. Species masks prune uniform-grid cells. Both backends expand search rings until a distance bound proves the result. Stable identifiers break ties. GPU buffers stay resident through indexing, movement and point rendering. A lost or unavailable device starts the CPU prototype from its original seed and displays the reason. This workload excludes contact conversions, threat responses and Outbreak. The main game retains those behaviors on CPU.

## Verification

`node dev/tests/circles.cjs` checks swept impacts and determinism. `python dev/tests/gameplay.py` exercises both real solvers, the 3- and 5-species matchups, Zombie exposure, separation, release, incubation, and deterministic full-state replay. `python dev/tests/gpu.py` checks 257 agents for 12 ticks on SwiftShader, actual draw submission, explicit device destruction and missing-adapter fallback. Target and stable IDs matched. Maximum position/velocity component difference was 0.000043. The geometry, resize, camera and desktop/mobile browser suites also passed.

## Prototype benchmark

Chrome Headless Shell 151, Linux x86-64, Intel Xeon Platinum 8573C, WebGPU SwiftShader software adapter. One measured fixed step and draw after one warm-up step, with a queue fence between stages. The snapshot transfer is an explicit diagnostic after drawing. Draw cost includes software scheduling. Init includes pipeline creation and initial upload. Memory is requested GPU buffer space, excluding driver and canvas overhead. See `python dev/tests/benchmark_lab.py`.

| Agents | CPU step ms | GPU step ms | Draw ms | Init ms | Snapshot ms | GPU MiB | Invalid / target differences |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 5.6 | 2.8 | 111.8 | 605.8 | 23.5 | 0.07 | 0 / 0 |
| 10,000 | 18.1 | 16.6 | 88.6 | 283.7 | 11.9 | 0.66 | 0 / 0 |
| 100,000 | 259.4 | 166.4 | 523.2 | 491.7 | 81.9 | 6.58 | 0 / 0 |
| 1,000,000 | 3280.4 | 1465.3 | 434.3 | 580.5 | 71.6 | 65.81 | 0 / 0 |

## Full RPSLS game benchmark

Same Phase 2 sampling procedure as dev.2. This exercises actual battle interactions on the dedicated CPU solver.

| Agents | Median / p95 frame ms | Circle physics ms/step | JS heap MiB |
|---:|---:|---:|---:|
| 1,000 | 50.1 / 266.7 | 5.1 | 30.4 |
| 5,000 | 66.8 / 283.3 | 28.2 | 61.6 |
| 10,000 | 116.6 / 166.7 | 36.1 | 84.4 |

The GPU prototype has a one-million-agent ceiling and checks the adapter's buffer and dispatch limits. The full game retains a 15,000-agent cap. Hardware GPU, physical mobile and full-rule GPU performance remain unmeasured. Changes for this milestone are under `dev/` in the build, game and HTML entry points, circle solver, lab sources and regression/benchmark tests.
