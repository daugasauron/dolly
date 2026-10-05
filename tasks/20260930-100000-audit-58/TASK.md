# Tests assert on source text, prose and repository contents

- STATUS: CLOSED
- PRIORITY: 160
- TAGS: tests,cleanup

AGENTS.md forbids testing implementation spelling or prose. Offenders: source slicing by string
markers (`test/browser-startup.test.mjs:42-43`, `literal-filenames.test.mjs:10-12`,
`terminal-ring.test.mjs:35-39`, `process-archive.test.mjs:10-12`,
`preparation-cache.test.mjs:26`, `pages-publication.test.mjs:11-17`); golden hashes of source
(`bhop.test.mjs:15-19`); repository content assertions (`dollyfile-modules.test.mjs:250-297`,
`380`, `507-519`); prose assertions (`browser-harness.mjs:6052-6056`, `4143`, `4170-4171`,
`4063`, `4101`, `studio.test.mjs:15`, `dolly.artifacts.mjs:31`); silent `.replace()` patches of
`src/gpu-worker.mjs` in `0ad-menu-browser.mjs:12-14`, `gpu-render-browser.mjs`,
`fluid-browser.mjs:8`. `npm run test:source` is not source-only: 11 files import `dist/` or
`build/`.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Tests exercise behavior through modules and binaries.

## Done when

- Offending tests rewritten as behavior tests or deleted; suite still passes.

## Progress (2026-10-01)

- Removed the source-hash test from `demos/bhop/test/bhop.test.mjs`; the
  compiled Airtime check there covers the physics.
- Removed the prose assertion from `demos/studio/test/studio.test.mjs`.
- Pages' digest check moved into `scripts/verify-sha256.sh`, which the workflow
  runs and the test calls; the process archive is published with
  `replace_if_changed` like the client archives, and its slicing test is gone.
- Still slicing: `test/terminal-ring.test.mjs` (C functions cut out of
  `src/dolly.c`) and `test/preparation-cache.test.mjs` (key prefix of the
  prepare scripts, which guards cache keys against checkout location).
- Plan for `test/terminal-ring.test.mjs`: it cuts `dolly_terminal_present_pending`
  and `handle_terminal_event` out of `host/display/kernel.c` and compiles them
  natively with stubs. Move the input-ring compaction into its own source in
  `host/display/` that the kernel build and the test compile directly, so the
  test needs no text markers.

## Progress (2026-10-02, branch `core/host-modules-2`)

- `test/terminal-ring.test.mjs` no longer cuts C out of the display kernel:
  the input-ring handling (`dolly_input_ring_handle`,
  `dolly_input_ring_service`) is `host/display/input-ring.c`, listed in the
  display manifest's `kernel` sources and compiled directly by the test with
  a probe driver. `dolly_terminal_present_pending` keeps only its gate.
- `test/preparation-cache.test.mjs` stays as it is: it checks a behavior (a
  preparation key ignores the checkout location and tracks the script and
  patch) and cuts each script at its first statement after the key
  assignment only to avoid the fetch and compile that follow. The
  alternatives are a print-key mode in every prepare script, which is a
  test hook in production scripts, or a Git checkout fixture per script;
  neither is worth its lines for this one check.

## Closed (2026-10-05, big-picture review)

Every offender named above is rewritten, deleted or kept with a recorded
reason, except two demo tests that still patch the trusted GPU worker's
source text; that item moved to `20260930-100000-audit-24` (test surface in
trusted code).
