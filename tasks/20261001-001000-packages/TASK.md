# amy: install packages from inside the runtime

- STATUS: OPEN
- PRIORITY: 170
- TAGS: dollyfile,design,packages

Owner question (2026-09-30): would a package manager fit the build images and
modules, and could Dollyfiles use it directly? Only with clear wins that reduce
complexity; no new Dollyfile version otherwise.

## Findings (research 2026-10-01, notes in `build/evidence/pkg-research.md`)

- Dolly already has the Nix-shaped core: a module that imports a builder image's
  outputs (`COPY FROM` + `EXPORTS` + licenses) is a package; its pin is its version
  and covers the whole chain; `USE HOST /modules/X.dm SHA` installs it; the site
  release is the repository; `/etc/dolly/artifact` is the bill of materials.
  `pi.dm`, `neovim-runtime.dm` and `search-tools.dm` already work this way.
- Per-package caching is safe in Nix only because every build writes a private
  read-only store path; Dolly's shared writable filesystem is why module caching
  was rejected (v3). Dolly's store path is an image.
- `INSTALL X SHA` would be `USE` respelled; `INSTALL X` unpinned is `RUN apk add`,
  which is not reproducible. Neither is a win.
- Measured: packages are 20-300x smaller than their builders (rg/fd 1.1 MB gzip vs
  a 397 MB builder); consumers repeat the SDL2 block (classicube, bhop, rts-arena)
  and the dolly-js block (bhop, slopyard) row for row.
- Sessions replay files only: `EXPORTS ENV` of anything installed at runtime is
  lost on reload (`/etc/dolly/environment` is read at image restore).

## amy (owner idea, 2026-10-01)

`amy install python` inside a running session. Sketch, to be validated by the
experiment below:

- **Name to recipe:** one site-published index (e.g. `/amy/index`) maps a name to
  its pinned package module (`HOST /modules/python.dm SHA`) and the digest of a
  prebuilt payload. The index is the only unpinned step; the pin is recorded.
- **Payload:** exactly the package module's files plus its receipt, built in the
  browser like any image (a root image of copied files, as `demos/lean` shows),
  not the 20-300x larger builder.
- **amy itself:** a small core command. It fetches the index and payload over the
  HTTP broker (same origin, default policy), verifies SHA-256, checks `REQUIRES`
  against `/etc/dolly/artifact`, extracts without overwriting different bytes, and
  appends `USE HOST /modules/python.dm SHA` to `/etc/dolly/installed`. That file
  plus `FROM <booted image>` is a Dollyfile that reproduces the session.
- **Open:** ENV exports are lost on session reload; the payload format (tarball vs
  snapshot packs); the 512 MiB session cap for large SDKs.

## Next

1. Clear win, no language change: move the repeated SDL2, dolly-js and
   javascript blocks into package modules and `USE` them (about 25-30 fewer
   consumer rows, one pin edit per upstream bump). Add one paragraph naming the
   convention to `docs/dollyfile.md`.
2. Experiment before any design: publish deterministic tarballs of nvim, rg/fd and
   pi outputs under `static/`, install them into a live `default` tab with `curl`,
   `sha256sum` and `tar`, save and reload the session, and measure bytes, time to a
   working tool and session size against booting the dedicated image. Build an
   installer only if installs take seconds, sessions stay far below 512 MiB and the
   ENV gap has a small fix.
