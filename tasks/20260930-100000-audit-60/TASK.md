# No continuous integration runs tests

- STATUS: OPEN
- PRIORITY: 140
- TAGS: tests,build

`.github/workflows/pages.yml` is `workflow_dispatch` only: it downloads a release tarball,
verifies and deploys. All verification is local and manual.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

At least the source suite runs on every push.

## Done when

- A workflow runs `npm run test:source` (needs a way to obtain generated ABI fixtures without
  the full toolchain, or a documented reason why not).
