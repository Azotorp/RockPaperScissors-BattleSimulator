# Dev.6 ordered GPU contacts

The [swarm lab](lab/) offers Classic contact battle, RPSLS contact battle, and Outbreak contacts. The GPU follows the CPU circle solver's contact order. In Classic and RPSLS, each creature can participate in one conversion per tick. In Outbreak, simultaneous bites contribute one tick of exposure. Continued contact speeds incubation. The lab supports up to 1,024 agents with solid walls for these workloads. Pursuit runs retain their one-million-agent limit.

## Measured results

Chrome Headless Shell 151 on Linux, using SwiftShader software WebGPU. These are single first-step and separately fenced first-draw samples from the same seeds as the CPU reference. They include first-use costs. They measure the contact lab, with 60 simulation ticks per simulated second.

| Agents | Workload | CPU step (ms) | GPU step (ms) | GPU draw (ms) | Conversions on first tick |
|---:|---|---:|---:|---:|---:|
| 128 | Classic | 2.5 | 10.1 | 187.1 | 29 |
| 128 | RPSLS | 1.0 | 10.4 | 137.5 | 31 |
| 128 | Outbreak | 1.0 | 6.3 | 141.6 | 0 |
| 1,024 | Classic | 6.6 | 21.2 | 148.8 | 224 |
| 1,024 | RPSLS | 7.1 | 23.9 | 163.8 | 258 |
| 1,024 | Outbreak | 11.6 | 24.4 | 166.3 | 0 |

CPU and GPU agreed on every agent ID, type and infection timer in these six samples. The largest absolute position or velocity difference was 0.00124 or less. A separate three-creature fixture put two scissors in contact with one rock. The scissors with the higher ID occupied the earlier cell and converted on both backends. Additional fixtures covered a later GPU dispatch block, double bites, incubation acceleration and conversion at expiry.

[Lab screenshot](tests/previews/ordered-contacts.png)

## Verification and deployment

Run the Node tests in dev/tests and the Python gameplay.py, browser.py and gpu.py checks there. Coverage includes the main game's two CPU solvers, outside-only resize, portal and wall behavior, desktop and mobile viewports, pursuit parity, device loss and the missing-adapter fallback.

The changes are in the dev build metadata and entry page, lab engines, shaders, controls and GPU tests. The cPanel development copy targets public_html/rockpaperscissors/dev/. The copy command was checked using a local staging directory.

## Remaining work

The main arena still runs on CPU. Its complete steering, swept gameplay contact tolerance, configurable Outbreak rules and portal battles still need end-to-end GPU parity checks. Dense combat above the lab cap, hardware GPU testing, physical mobile testing and live cPanel verification remain open. For the million-agent pursuit measurements, see the [dev.5 results](RELEASE-dev.5.md).
