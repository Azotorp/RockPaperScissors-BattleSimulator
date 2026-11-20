# Swarm Arena v0.3.0-dev.2

The boundary portion of this milestone is available under `/dev/` on `main`. The starting revision was `b19d62c`. The first implementation commit was `20c4a75`. **Resize Arena to View is pending the owner's relocation decision.** The development milestone is open.

## What changed

- Wall width is 1–100 world units, calibrated to CSS pixels at 1×. The inner rectangle drives wall collision, steering, portal entry, spawning, rescue, toroidal distance, target selection and drawing. During the swept step, walls remove outward velocity and preserve sliding motion. The one-pixel visual floor grows outward from the physical plane.
- A creature's leading rim enters the portal plane. The opposite side places its trailing rim at that plane and carries forward any remaining displacement. Left/right use orange, top/bottom use blue. Tangential position and velocity are preserved. Contact detection considers the actual motion on each side of a transfer.
- Nine visual styles apply to both boundary modes. Selecting the None style hides the border. Selecting No boundary disables its geometry. Each game mode stores its style in the existing dev settings record. Existing schema 3 preferences and older imports use Outset when the style is absent.
- Boundary, width and style have separate responsive rows. A live width or boundary change updates geometry and rescues displaced agents. Impossible geometry produces a message. Changing the browser viewport leaves the fixed arena and creature radii alone.
- Source changes span `build.js`, `index.html`, `main.js`, `sim/boundary.js`, `sim/core.js`, `ui/arena.js`, `ui/settings-window.js`, `ui/window.css`, and the Classic theme CSS, all inside `dev/`.

## Verification

Run from the repository root.

```sh
node dev/tests/boundary.cjs
python dev/tests/browser.py
```

The browser test uses Python Playwright. Set `SWARM_CHROMIUM` to the browser executable. Set `SWARM_CDN_CACHE` to a directory containing the pinned PixiJS 8.23.0 and p2.js 0.7.1 scripts to run with cached libraries. Set `SWARM_SCREENSHOTS` to capture both viewport sizes.

| Check | Result |
|---|---|
| Geometry and sweep fixtures | Four edges, corner transfers, radius and tangent preservation, 10,000-span overshoot, seam FOV and target distance, wall slides and contacts, unbounded bypass passed |
| Chromium, real PixiJS and p2 | Static `/dev/` entry, loaded assets, nine distinct border rasters, portal palette, fast movement, crowd pressure, responsive controls and storage isolation passed |
| Existing gameplay and simulation suites run against dev | RPS/RPSLS matchups and perception, Outbreak states, exposure and incubation, deterministic spawning, stale contacts, settings migration and 1,400 nearest queries passed |
| Deployment staging | The existing cPanel dev copy command populated a temporary symlinked webroot. Recursive file comparison matched. Live cPanel deployment was not triggered or verified in this session. |
| Stable channel | Git tree comparison against `b19d62c` found all changes under `dev/`. |

[Desktop screenshot](tests/previews/boundary-1200.png) · [Mobile-width screenshot](tests/previews/boundary-390.png)

## Performance

Intel Xeon Platinum 8573C, Linux x86-64, Chrome Headless Shell 151.0.7922.34, SwiftShader WebGL, CPU/p2 simulation. Each entry is one run of the Phase 2 benchmark sampling body, with a fresh single-process browser per population. RPSLS used five equal starting populations, seed `bench-v1`, solid walls, 1200 × 760, eight warm-up frames and 45 measured frame intervals. Step time below sums the four instrumented stages. The JS heap is a single sample. Frame time includes browser scheduling and rendering.

| Build | Agents | Build ms | Frame median / p95 ms | Step ms | AI / p2 / contacts / render sync ms | JS heap MiB |
|---|---:|---:|---:|---:|---|---:|
| Stable 0.2.0 | 1,000 | 519.3 | 66.7 / 166.7 | 13.6 | 4.9 / 2.7 / 5.1 / 0.9 | 37.1 |
| Stable 0.2.0 | 5,000 | 970.7 | 83.4 / 200.0 | 66.3 | 27.8 / 13.2 / 22.1 / 3.2 | 47.0 |
| Stable 0.2.0 | 10,000 | 1618.6 | 100.1 / 150.0 | 99.7 | 40.9 / 22.8 / 30.6 / 5.4 | 85.2 |
| Dev.2 | 1,000 | 204.0 | 50.0 / 133.4 | 12.8 | 4.7 / 2.4 / 4.9 / 0.9 | 33.8 |
| Dev.2 | 5,000 | 977.4 | 66.6 / 100.0 | 52.0 | 20.7 / 10.0 / 18.1 / 3.3 | 66.3 |
| Dev.2 | 10,000 | 1100.8 | 116.7 / 166.6 | 115.2 | 49.4 / 29.1 / 30.7 / 6.0 | 74.3 |

At 10,000 agents the dev build took longer per frame and physics step than the stable build in these samples. Trial-to-trial variation, software rendering and unseeded in-round AI limit comparisons. GPU transfer and isolated draw costs were not measured. Physical mobile devices were not tested.

## Remaining work in order

1. Confirm whether manual resize moves only outsiders or remaps every agent. Implement the chosen policy, deterministic placement in crowded arenas, rescue immunity and cache rebuilding. Finish dev.2 acceptance and tag the completed milestone.
2. Dev.3 covers extreme camera precision, coordinate separation and metric-grid verification at the requested distances.
3. Dev.4 covers the dedicated deterministic CPU reference, WebGPU prototype, device selection/loss and first backend parity benchmarks.
4. Dev.5 and later cover GPU interaction parity, rendering and simulation LOD, and the 100,000 and 1,000,000-agent stress matrix. The current game uses CPU/p2 and retains its 15,000-agent round limit.
