# Swarm Arena

Phase 2 test build 1 combines the Classic visual theme with three playable simulations. Classic RPS and five-species RPSLS use contact conversion. In Zombie Outbreak, humans flee, accumulate bite exposure, incubate and transform. The population HUD and Outbreak legend show live counts.

## Run locally

Extract the ZIP and open a terminal in the directory containing `index.html`. Start a static server:

```sh
python -m http.server 8080
```

Open **http://localhost:8080/**. On Windows, `py -m http.server 8080` also works. The browser needs WebGL and access to the pinned PixiJS 8.23.0 and p2.js 0.7.1 CDN scripts. There is no application server or package installation.

## Play

- Choose a mode, set the starting population, then select **New round**. Pick a winner before **GO**. RPS modes start paused. Outbreak starts with wandering humans. Choose **Seed zombie** and click a human to create patient zero, or set starting zombies in **Settings → Spawning**.
- Click or hold to use the spawn brush. Right-drag to pan and use the wheel to zoom. On touch, tap or hold to spawn, drag two fingers to pan, spread to zoom in and pinch together to zoom out. **Focus** follows a selected creature. **Fit view** restores the default camera.
- **Settings → Perception** configures each species separately. **Settings → General → Focused creature inspector** adds the actor's state, target and timers to the follow display. **Spawning** shows the current seed and can reuse it for the next round.
- **Data & Storage** manages browser-local preferences, import/export and resets. Use the same browser profile and origin to restore your settings. A reload starts a fresh simulation.

## Hosting

Copy `index.html`, `main.js` and the complete `assets/`, `ui/`, and `sim/` directories to the same web directory. The included cPanel deployment file copies these paths to `$HOME/public_html/rps`. The checked-in theme registry is ready to serve.

## Release and development

- [Phase 2 gameplay rules, settings migration, benchmarks and test checklist](docs/PHASE-2-RELEASE.md)
- [Classic asset inventory and artwork comparison](docs/ASSET-INVENTORY.md)
- [Phase 1 visual API and theme authoring](docs/PHASE-2-HANDOFF.md)
- [Theme manifest schema](docs/theme.schema.json)

Run the pure simulation checks with `node tests/simulation_core.js` and the registry checks with `python tests/theme_registry.py`. Browser tests require Python Playwright, Chromium and Pillow for pixel checks. Set `SWARM_CHROMIUM` to the Chromium executable. Real-engine tests use the production CDN URLs or `SWARM_CDN_CACHE` pointing to cached copies of those exact library versions. Test entry points and results are in the release notes.
