# Swarm Arena — Development channel

## Release channels

| Location | Channel | Version | Policy |
|---|---|---|---|
| `/` | Stable | Phase 2 baseline (designated v0.2.0) | Do not modify during v0.3 development |
| `/dev/` | Development | `0.3.0-dev.1` | Independent code, assets, settings and experiments |

The files in `dev/` are a complete deployable copy of the Phase 2 build. No new GPU or boundary features are implemented by this channel bootstrap. It is the starting point for the upcoming work order.

## Version scheme

- `0.3.0-dev.1`, `dev.2`, etc: working development snapshots.
- `0.3.0-beta.1`: feature-complete testing.
- `0.3.0-rc.1`: final pre-release validation.
- `0.3.0`: production-ready stable release; promote only after review and tests.
- Change `dev/build.js` (single authoritative displayed version) and the `dev/index.html` `main.js` cache-busting version when publishing each snapshot.
- Add a matching Git tag and record the source commit for each published version. The `baseCommit` value marks the source baseline, not necessarily the build commit.

## Settings isolation

The stable game uses `localStorage['swarmArena.preferences']`.
The dev game uses `localStorage['swarmArena.dev.preferences']`.
Do not auto-copy or auto-migrate settings between channels. Each can export/import its own settings explicitly through Data & Storage. New dev-only saved data should use the `swarmArena.dev.` prefix.

## Deployment

The existing `.cpanel.yml` copies production files as before and additionally copies the self-contained `dev/` folder into `$HOME/public_html/rockpaperscissors/dev/`, provided the parent deployment path is the expected existing symlink. If the hosting deployment is not triggered automatically from GitHub, update/pull the repository in cPanel and deploy the checked-out revision.

Local test:

```sh
python3 -m http.server 8080
# Open http://localhost:8080/ and http://localhost:8080/dev/
```

Verify both versions load assets locally; compare settings storage keys; ensure changing the dev game does not affect root settings. The development channel intentionally remains on the original CPU/p2.js simulator until the dedicated GPU work order is implemented and benchmarked.
