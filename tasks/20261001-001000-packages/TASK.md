# amy: install packages from inside the runtime

- STATUS: CLOSED
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

## Language side (2026-10-01, `20261001-214000-dollyfile-v6`)

DOLLY 6 settles the vocabulary: a `PACKAGE` recipe keeps only what it
declares, `INSTALL URL SHA256` imports it with its exports anywhere (the row
`amy install` executes), and the release publishes `dist/dolly-packages.txt`
(`NAME URL SHA256` per line). `javascript`, `python`, `ripgrep`, `fd` and
`protox` are packages. What amy still needs from the engine and runtime is
listed in that task's design section: a live `apply` mode, artifact placement
by the page, environment loading after session replay, and the index grant.

## amy (implemented 2026-10-02, branch `work/amy`)

Design, each piece a consequence of DOLLY 6 rather than an addition to it:

- **One INSTALL.** `dollyfile install URL SHA256` ([`dollyfile.c`](../../src/dollyfile.c),
  `install_live`) runs the engine's `load_artifact(IMPORT_INSTALL)` against the
  live filesystem: it parses the booted image's own recipe (`/etc/dolly/Dollyfile`,
  execute = 0) for the declared `REQUIRES HOST` set, reads
  `/etc/dolly/environment` back into the engine, restores the package, writes
  the merged environment file and appends the row to `/etc/dolly/installed`.
  Nothing is sealed. Builds and sessions share every line of INSTALL.
- **The host check moved to the row.** The engine used to collect a package's
  host modules and check them at seal; a live install has no seal and must not
  leave half a package behind, so `read_artifact_receipt` now refuses an
  undeclared module as it reads the receipt, before any file is written:
  `dollyfile: URL needs threads@0: add REQUIRES HOST threads@0`. For that to be
  exact in builds too, `REQUIRES HOST` lines must precede every other
  declaration (both parsers; the catalog already complied; four syntax vectors).
  The seal-time list and check are gone.
- **Control files are not payload.** INSTALL skips the six files that describe
  the package image (`/etc/dolly/Dollyfile`, `artifact`, `environment`, `image`,
  `image.manifest`, `recipes.lock`); in a build the seal rewrote them anyway, in
  a session they must stay the booted image's (`/etc/dolly/image` is checked at
  boot). `/etc/dolly/recipes/Dollyfile-NAME` is still imported as provenance.
- **amy** ([`amy.c`](../../src/commands/amy.c), built with the agent tools in
  `Dollyfile-system-tools`) is a front end: `install NAME…` looks the name up in
  the index, fetches the snapshot to `/etc/dolly/artifacts/SHA.snapshot`, runs
  `/bin/dollyfile install URL SHA256` (its log on stderr), removes the artifact
  and reports; `list` marks installed index entries; `installed` prints the
  record as `NAME URL SHA256`. An unknown name, a service denial and an engine
  failure each name the package and the reason. `freeze` is not implemented: it
  needs the SHA-256 of the booted recipe and the ENTRY words, about 60 more
  lines; the record already holds the rows it would write.
- **packages@0** ([`host/packages/`](../../host/packages/module.json)) is a
  host module without Wasm imports, like `build@0`: once ENTRY starts it owns
  the reserved origin `https://packages.dolly.invalid` behind the HTTP broker
  ([`host/http/local-services.mjs`](../../host/http/local-services.mjs), moved
  from `host/build/` and generalized so each service admits its own requests).
  `GET /v1/index` returns the release's `dist/dolly-packages.txt`;
  `GET /v1/packages/SHA256` maps the recipe pin to a published package and
  returns its snapshot, rebuilt and verified from the packs by the same
  `loadPackagedSnapshotMetadata` and `loadPackagedSystemSnapshot` a rebuild
  uses. Bounds: GET without body or query only, 404 outside the release, one
  snapshot held per page until the guest has read it or the 30-minute deadline
  cancels it (409 meanwhile), 64 snapshots per page (429), 2 GiB per snapshot,
  no headers or credentials. The bytes are sandbox data; nothing else is granted.
  `default` declares `packages@0` and `threads@0` (the Rust tools it installs).
- **Why not let the guest fetch the packs itself.** The engine already streams
  and hashes HTTP bodies, but a published image is a pack manifest in a JS
  module plus gzip packs merged by record order; the guest would need a JSON
  reader, gunzip (the seed has no zlib) and `mergeSnapshotRecords` in C, a
  second implementation of `snapshot-records.mjs`, and a grant on
  `dist/packs/*`. The local service is about 60 lines of page code and reuses
  the verified path byte for byte; the guest-side cost would be the same bytes
  plus the decompression it now gets from the page.
- **Environment after replay.** The kernel loaded `/etc/dolly/environment` inside
  `dolly_bootstrap_snapshot`, `dolly_bootstrap_finish` and the streamed end,
  all before the snapshot module replayed a session. The load is now one export,
  `dolly_bootstrap_environment` ([`dolly.c`](../../src/dolly.c),
  [`dolly-image-0.wat`](../../abi/dolly-image-0.wat)), that the worker calls
  after `host.imageRestored`. No amy code is involved.
- **Sessions and large packages.** Installed files are session files. The save
  path already refuses a delta above 512 MiB (`Save failed: Dolly session
  exceeds its size limit`, the previous save intact); that explicit failure is
  the chosen behavior. Replaying rows on restore would need the page to
  materialize packages during session load and the delta to exclude their
  paths, which is the next step for model packages.
- **Environment in the live shell.** Exported variables land in
  `/etc/dolly/environment` and apply when the session loads; the running shell
  keeps its copy, as `/etc/environment` does on Linux. amy says so. A package
  whose program needs a variable to start (`pi` and `PI_PACKAGE_DIR`) should set
  it from its own launcher; that is the demo's decision.

### Evidence (2026-10-02, branch `work/amy`, runtime `baf2556f…`, image inputs `9f7a44a7…`)

Images rebuilt with the new seed: the `default` chain (10 images, 880 s
serial) and `python` (297 s); logs in `build/amy-evidence/`. Rust packages
could not be built (the Rust compiler seed is being rebuilt for the new
process ABI), so the browser test proves the host check with a crafted
`threads@0` package and `python` as the real install.

- `node test/amy-browser.mjs`: amy chromium 18.2 s, firefox 13.2 s; amy
  refusal chromium 3.2 s, firefox 4.5 s. `amy install python` (47 MB
  snapshot, 1,702 paths) took 1.1–2.6 s in Chrome and 2.0 s in Firefox,
  measured from the shell prompt to the next prompt, packs served by the
  local test server; `python3 -c` ran at once. Saving the session with
  python installed: 47,004,062 bytes of changes, 14,594,300 bytes stored
  (Chrome; Firefox 14,630,988). After reload `python3`, `PYTHONUTF8=1` and
  `PYTHONDONTWRITEBYTECODE=1` were present. On `system`, `dollyfile install`
  of the `threads@0` package exits 2 with `Dollyfile-threaded needs
  threads@0: add REQUIRES HOST threads@0` and writes nothing; `amy install`
  reports the missing `packages@0`; `curl` to the service fails.
- `node test/core-browser.mjs chromium` 43.0 s, `firefox` passed (default
  now enables `packages@0` and `threads@0`); `host-modules-browser`,
  `boundary-browser`, `image-browser` (the engine compiled from source in
  the session), `custom-session-browser` and `image-inventory-browser`
  passed in both browsers; `node scripts/dolly-abi.mjs validate-browser`
  confirms the outer import set is unchanged; `node --test test/*.test.mjs`
  251 pass, `demos/**/*.test.mjs` 82 pass.
- Session cap (`build/amy-evidence/session-cap.mjs`): python plus a 300 MiB
  file saved in 3.7 s (361,574,598 bytes of changes, 14.9 MB stored);
  python plus a 600 MiB file failed in 3.9 s with `Dolly session exceeds
  its 512 MiB limit; remove files or installed packages and save again`,
  nothing stored, and saved again after `rm`. The page used to print
  `capture failed with status -22` (Dolly's `EFBIG`).
- `npm run test:artifacts`: the checks on rebuilt images pass; the suite as
  a whole needs the full catalog (stale images from the old seed, `fd` not
  built here).

Next: `amy freeze NAME`; replaying recorded rows at session load so model
packages need not live in the delta; `ripgrep`/`fd`/`pi-coding-agent` on
`default` once the Rust seed is rebuilt; a `pi` launcher that sets its own
`PI_PACKAGE_DIR`.

## Closed (2026-10-02)

amy installs packages into a running `default` session through `packages@0`; `amy freeze` and replaying rows at session load are not built (the record holds the rows).

Verified on the integration branch `work/dollyfile-v6` (`0d54a87`), release
`fcb204c0…`: 51 images rebuilt from scratch (image inputs `9f7a44a7…`),
artifacts 20/20, source 334/334, every browser suite in Chrome and Firefox,
image-inventory acceptance for every application and toolchain, and the demo
tests for python, javascript, emacs (Chrome and Firefox), pi, neovim, rust,
cmake, sdl2, studio, codex, bhop, classicube and rts in Chrome.
