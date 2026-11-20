# Dev.3 camera and precision

The camera can show ±1,000,000 km along the shorter viewport axis at every supported metric calibration. Grid spacing uses bounded 1/2/5 metric intervals. World and camera arithmetic use JavaScript doubles. A manual bounded resize far from the current origin assigns an integer local anchor. Simulation, spatial searches, collisions and sprites then use offsets from that anchor. Global position equals anchor plus local position. Camera input alone never moves the anchor.

A physical arena may span up to 2²¹ creature radii in this build. The camera can display a much wider region. Unbounded brush placement retains a local precision limit. At the maximum 100,000× close zoom near a gigametre coordinate, double precision and a saved camera translation can produce pixel-level rounding. Desktop and mobile-width browser tests exercised far-origin portal arrival within 0.01 world units, unbounded resizing, and camera-only changes with identical actor positions.

Changes are in build metadata, the dev entry point, main camera/resize handling, settings validation, grid rendering, the camera helper and dev tests. The existing settings envelope accepts older saved camera positions. Tests include `node dev/tests/camera.cjs`, `node dev/tests/boundary.cjs`, `node dev/tests/resize.cjs`, and `python dev/tests/browser.py`.

## CPU/p2 browser benchmark

Chrome Headless Shell 151, Linux, Xeon Platinum 8573C, SwiftShader, real PixiJS/p2. Same 45-frame RPSLS sampling procedure as dev.2. One trial per row.

| Actors | Median / p95 frame ms | AI / p2 / contacts / sync ms per step | JS heap MiB |
|---:|---:|---|---:|
| 1,000 | 66.6 / 166.7 | 4.3 / 1.9 / 4.3 / 0.9 | 35.4 |
| 5,000 | 66.6 / 116.7 | 24.2 / 13.2 / 18.3 / 3.5 | 86.1 |
| 10,000 | 116.7 / 183.3 | 47.4 / 33.3 / 29.1 / 6.4 | 92.5 |
