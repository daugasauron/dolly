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

`amy install python` inside a running session; the Dollyfile language and amy must
match with good taste. Sketch, to be validated by the experiment below:

- **One vocabulary.** An amy install is a Dollyfile row executed live. The site
  publishes one index mapping a name to that row, e.g.
  `python COPY FROM HOST /Dollyfile-python-package SHA / /`. amy is a thin front
  end over `/bin/dollyfile`, which already runs in userspace, fetches `HOST`/`URL`
  inputs through the broker, verifies SHA-256 and decodes image artifacts
  (`src/dollyfile.c` `load_artifact`).
- **Recorded as rows.** amy appends each executed row to `/etc/dolly/installed`;
  `FROM <booted image>` plus those rows is a Dollyfile that rebuilds the session
  as an image (`amy freeze`). The index is the only unpinned step.
- **Lean package images.** A package is a small root image holding only the
  package's files and exports (as `demos/lean` shows), so both a Dollyfile author
  and amy copy it instead of a 20-300x larger builder.
- **Gaps.** (1) In a live session nothing places artifacts in
  `/etc/dolly/artifacts`; builds get them from trusted code
  (`src/runtime-worker.mjs`), so the executor would fetch the package artifact
  itself. (2) `COPY FROM` imports no exports, so a package's `ENV`/`TOOL` objects
  need an import rule shared by the language and amy. (3) `/etc/dolly/environment`
  is read at image restore, before session files replay, so installed `ENV` is
  lost on reload. (4) Payload trust equals the image cache's: published digests,
  reproducible by rebuilding the pinned recipe.

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
