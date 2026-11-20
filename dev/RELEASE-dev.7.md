# Dev.7 playback speed with large crowds

The main arena now displays the requested multiplier and actual simulated seconds per real second. Fast-forward gives the CPU more time to complete fixed 1/60-second physics steps. Once the game uses its processing budget, rendering and input get their turn. The configured maximum step count still applies. In peaceful Outbreak rounds, humans wander and collide while the game skips target searches and infection checks until patient zero appears. The CPU circle solver uses compact cell storage where the arena permits it and preserves contact order across dense and sparse layouts.

![Speed control at 9,999 humans](tests/previews/playback-speed.png)

## Reproduction and measurements

The test used the dev game page in Chromium 151 on Linux with SwiftShader rendering, the Swarm CPU solver, a fixed seed, 9,999 humans and zero initial zombies. It switched the slider from 1× to 30× and back without resetting the round. Each rate below is simulated seconds per real second over three seconds of wall time after a short warm-up.

| Build and run | 1× | 30× | Back at 1× |
|---|---:|---:|---:|
| dev.6 | 0.21 | 0.19 | 0.19 |
| dev.7, run 1 | 0.19 | 0.70 | 0.30 |
| dev.7, run 2 | 0.16 | 0.33 | 0.24 |

The old scheduler usually completed one step per rendered frame at either setting. Actual rates still depend on the device, rendering cost and population. At 9,999 humans this test machine stayed below real time. No physical phone was benchmarked.

## Verification

The playback test checks the population, the live speed readout, clearing that readout on pause, and adding patient zero after a peaceful run. Run it with python dev/tests/playback.py in the same Chromium environment as the gameplay suite. Browser layout, main-game CPU and p2 gameplay, circle contact order, WebGPU parity and fallback tests passed. The deployment target is the existing cPanel dev/ directory.
