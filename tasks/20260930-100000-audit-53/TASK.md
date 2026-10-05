# Edit-to-verified turnaround: a working-tree server, a full check that runs, no preparation before the cache check

- STATUS: OPEN
- PRIORITY: 300
- TAGS: core,iteration,build

`npm run serve` reads only sealed releases (`README.md:62`), so seeing a JS change in a browser
requires `npm run publish` (a browser check per image). The only source-tree server is
`scripts/serve-gpu.mjs`, documented only in `docs/gpu.md:107`; `test/browser-server.mjs:26-49`
keeps a hand-maintained allowlist of served files.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

One documented command serves the working tree with current `dist/` for local development.

## Done when

- README documents the dev server; tests reuse it.

## Review (2026-10-05, `20261005-131642-big-picture`): one iteration task

`AGENTS.md`: "Development iteration speed is king." Three open tasks described
one cost at priorities 100 to 160, below every demo task. They are merged
here (`20260930-100000-audit-52` and `20260913-105437-codex-16` are closed
into this one) and ranked with the core.

Turnaround today, from the tasks and the workspace notes:

| Edit | To a verified result |
| --- | --- |
| Page JavaScript | no working-tree server: `npm run serve` serves sealed releases only (`scripts/serve.mjs:39-72`), so a browser check goes through the test server or `npm run publish` |
| Kernel C | `npm run build:runtime` 9 s without changes (was 88 s), then `node test/core-browser.mjs` 20-25 s per browser; the full browser suite is 4-5 min per browser |
| Any recipe | `npm run image` runs `scripts/prepare-image-sources.sh` first (`scripts/build-image.mjs:43`): 124 s for the catalog with every input already staged, before the first cache check |
| Seed (Slop, a command, a header, libc adapter) | every image rebuilds: 843 s for the ten images of the `default` chain, about 3.5 h for the catalog (Codex about 70 min) |
| `process.h` | the above plus the Rust seed (5-8 min) and a 0 A.D. relink |

Found in this review: `npm run build` and `npm run test:full` have failed
since `3162a565` (2026-10-01), which removed the `snapshot` script that
`build` still calls (`package.json`: `"build": "npm run build:runtime && npm run snapshot"`;
`npm run snapshot` prints `Missing script: "snapshot"`). `README.md:74` still
documents `test:full`. Nobody noticed for five days, so the documented full
check is not what verifies a release.

Still open from the merged tasks: `scripts/build-snapshot-browser.mjs:17`
imports the test harness's server and detects cache reuse by reading the log
for "reusing local "; `scripts/site-release.mjs:216` spawns a test file.

## Done when (replaces the list above)

- One documented command serves the working tree with the current `dist/`;
  the tests and the image builder use the same server, and nothing under
  `scripts/` imports from `test/`.
- `npm run test:full` runs to completion or is deleted together with `build`
  and its README line.
- `npm run image -- IMAGE` with nothing changed finishes in under 10 s; the
  time before and after is recorded here.
- The table above is in `README.md` in place of the comments on the check
  commands, with the measured numbers.
