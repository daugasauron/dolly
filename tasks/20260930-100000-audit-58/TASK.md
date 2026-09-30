# Tests assert on source text, prose and repository contents

- STATUS: OPEN
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
