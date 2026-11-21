# Swarm Arena v0.3.0 stable promotion

November 20, 2026. Promoted the existing `0.3.0-dev.9` engine into the website root, keeping the `/dev/` snapshot unchanged for rollback/comparison.

Features inherited from dev.9 include high-range zoom and boundary changes, swarm CPU and experimental GPU movement, offscreen optimizations, mass-spawn controls, newer zombie behavior, and desktop/touch overlay improvements. The GPU lab remains an experimental component, not a performance guarantee at all device scales.

Production packaging removes the DEV badge, sets the stable version, uses the existing production preference key, and deploys engine dependencies including `build.js`, `default.config.json`, and `lab/`. The previous live source is saved at `backup/live-v0.2.0-before-v0.3.0`.

This GitHub promotion does not itself confirm cPanel deployment. Deploy the newest `main` revision through the cPanel Git interface if required, then smoke-test loading, spawning, zombie mode, the settings panel, mobile gestures, and the optional GPU mode.
