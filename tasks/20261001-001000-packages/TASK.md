# amy: install packages from inside the runtime

- STATUS: OPEN
- PRIORITY: 300
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

## Measured (2026-10-01, experiment 2 without the session step)

Packages were the files each image adds to or changes in `default` (excluding
`/etc/dolly/`), packed as deterministic ustar `.tgz`, served locally, and
installed into a live `default` tab with `curl`, `sha256sum -c` and
`gzip -dc | tar -xf - -C /`. Times are Chrome / Firefox wall time per command.

| Package | Files | Raw | gzip | Image | Unpack | First run |
| --- | --- | --- | --- | --- | --- | --- |
| neovim | 2,125 | 36 MB | 9.7 MB | 196 MB | 1.0 / 1.7 s | `nvim --version` 0.1 s |
| python | 1,070 | 41 MB | 16.1 MB | 201 MB | 1.4 / 2.2 s | `python -c` 0.1 s |
| pi (with rg, fd) | 6,006 | 82 MB | 22.4 MB | 243 MB | 2.5 s | `pi --version` 3.0 s |

Fetch and digest took at most 0.2 s each. Booting the dedicated image instead
takes 2.3 s (neovim, python) or 2.9 s (pi) in Chrome against 1.9 s for
`default`, so a live install costs about as much as switching images, while
moving 10-22 MB instead of the whole image.

Gaps found:
- Dolly's `tar` rejects symlinks (`validate path at ./usr/bin/qjs`, errno 138)
  and GNU long names (`././@LongLink`), and has no `-z`. Packages must be ustar
  with symlinks dereferenced (python's `python3 -> python` then costs 3 MB),
  or `tar` must learn both.
- Session: with all three installed, saving took 2.5-3.1 s and stored 48 MB
  (limit 512 MiB); reloading `/session/NAME` took 2.3-2.5 s and `nvim`,
  `python` and `pi` all ran again (Chrome and Firefox). These packages need no
  `ENV`, so the lost-`ENV` gap is still untested.

Conclusion: the experiment's bar holds (installs take seconds, sessions stay far
below 512 MiB). Next: teach `tar` symlinks and long names, then an installer.

Scripts: `pack.mjs`, `install.mjs`, `boot.mjs` and `session.mjs` in the session scratchpad
(not committed).

## Owner request (2026-10-01, 21:45)

Build images per model size (several Qwen sizes, plus another open-weight family)
and make amy work: `amy install qwen3-8b` pulls the model from its build image
into the running session. Model images: `20261001-214000-pi-local-model`.
amy's semantics are part of the Dollyfile v6 design
(`20261001-214000-dollyfile-v6`); amy is implemented on top of it.
