# Swarm Arena — Development channel

## Release channels

| Location | Channel | Version | Policy |
|---|---|---|---|
| `/` | Stable | v0.3.0 | Promoted from dev.9 on November 20, 2026; pause feature development |
| `/dev/` | Frozen development snapshot | `0.3.0-dev.9` | Preserved intact for comparison and future experiments |

The files in `dev/` remain a self-contained development build, retained as an archive following v0.3.0 promotion. Production now includes the swarm CPU / GPU movement experiments and newer boundary, spawn, and UI features. New gameplay work is paused here.

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

The existing `.cpanel.yml` copies the promoted production files, including `build.js`, `default.config.json`, and `lab/`, and also copies the self-contained `dev/` folder into `$HOME/public_html/rockpaperscissors/dev/`, provided the parent deployment path is the expected existing symlink. If the hosting deployment is not triggered automatically from GitHub, update/pull the repository in cPanel and deploy the checked-out revision.

Local test:

```sh
python3 -m http.server 8080
# Open http://localhost:8080/ and http://localhost:8080/dev/
```

Verify both versions load assets locally; compare settings storage keys; ensure changing the dev game does not affect root settings. The development channel intentionally remains on the original CPU/p2.js simulator until the dedicated GPU work order is implemented and benchmarked.

## Production promotion v0.3.0

- Source baseline commit: `d911a6e512bb939ac147399e0a0950b62623b32f` (`0.3.0-dev.9`).
- Prior production branch: `backup/live-v0.2.0-before-v0.3.0`.
- Production uses `swarmArena.preferences`, not `swarmArena.dev.preferences`.
- Confirm cPanel deploys the latest `main` commit before treating the public site as updated.
