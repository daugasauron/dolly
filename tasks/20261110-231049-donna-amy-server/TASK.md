# amy's package server is stated and configurable, and the docs say where amy reads from

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: donna,amy,packages,configuration,docs,0.1.6

Requested from Donna, the native Rust host of Dolly's userspace on wasmtime (`~/dev/donna`,
task `20261110-230235-dolly-requests` there; plan in `20261110-225114-native-host`). Donna runs
this repository's kernel, plugin, gate, programs and images unchanged and never forks a contract,
so what it needs changed is asked for here.

Owner (2026-11-11): images and packages are read over HTTP as Dolly does now; "just need to be
able to configure the server in amy before installing and make that more clear in dolly".

## State (2026-11-11)

Done on `fix/donna`: the server is an image directory. By default it is the one the page
loads its images from (boot()'s `images`, the site for its own pages; a host gives its own),
which `packages@0` names at `GET https://packages.dolly.invalid/v1/directory`. `amy server URL`
names another for the session in `/etc/dolly/packages-server`, and removing the file goes back.
`amy server` prints the server. amy reads `SERVER/amy-index.txt`, and asks for a snapshot at
`/v1/packages/SHA256/from/DIRECTORY`. The page reads a directory other than its own only
where its HTTP policy admits a GET of the directory's URL (`admit` in `host/http/http.mjs`,
counted and shown as the guest's request), else 403, and passes only packages built for its
runtime. A failure names the URL or says the service's reason. Docs: `docs/dollyfile.md`
("Packages and amy"), `docs/embedding.md` (`images`), `docs/browser-boundary.md`.
`test/amy-browser.mjs` checks `amy server`, a directory the policy refuses (the index and the
service), and an install from a second copy of the directory, `/mirror/`.

## Today

- `amy` reads its index as the site path `/v` DOLLY_VERSION `/amy-index.txt`
  (`src/commands/amy.c`, `index_url`) and fetches packages from the reserved origin
  `https://packages.dolly.invalid/v1/packages/` (`service`), which `packages@0` serves from the
  release the page runs (`host/packages/`, `docs/dollyfile.md` "Packages and amy").
- So the server is implicit: it is the site the page came from, resolved by the HTTP broker
  (`docs/http.md`, "Transport", site paths). Nothing in a session names it, `amy` has no way to
  show or change it, and the docs say it only in passing.
- Related: `20261104-143110-modules-r5` would move the package service off the broker onto its
  own channel; whichever lands first, the server must stay nameable.

## Wanted

- One stated place for the server: a file in the image (for example
  `/etc/dolly/packages-server`, written by the host at boot, which a session can read), or a host
  configuration value, decided here. The host keeps authority over it: a guest that rewrites it
  changes what it asks for, never what the policy admits.
- `amy server` prints it; `amy list`, `info` and `install` say where they read from when they
  fail.
- `docs/dollyfile.md` and `docs/embedding.md` say where amy reads from and how an embedding or
  another host (Donna's `--images URL`) sets it.

## Done when

`amy server` prints the server in `default` on the site and in an embedding, an embedding that
sets another directory gets its packages from there (`test/amy-browser.mjs`), the docs above
say it, and Donna's task records the commit.

## Closed (2026-11-11)

Done: `0df7aa0b1`, merged in `663e782fa`. On the 0.1.6 compiler round (`work/round-1111d.sh` to `round-1111i.sh`; seed and catalog pinned in `d1cb11dbc` and `6fdcad104`, image inputs `16a63999…`; logs in `build/round-1111-evidence/rerun*`)
`test/amy-browser.mjs` ("amy", which checks `amy server`, a refused directory and an install from
`/mirror/`) passed in Chromium and Firefox. Donna's `20261110-230235-dolly-requests` records the
commit, and its `20261110-230235-packages` ports the service.
