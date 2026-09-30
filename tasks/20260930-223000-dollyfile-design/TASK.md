# Dollyfile: design as executed, and gaps against it

- STATUS: OPEN
- PRIORITY: 280
- TAGS: dollyfile,design,replicability

Replaces the rejected `20260930-200000-dollyfile-v5`. Written after reading the
executor ([`src/dollyfile.c`](../../src/dollyfile.c)) and the spec history
(v1 `9e013dd`, v2 `c4dbe3a`, v3 `9909373`/`dd6b6a9`, v4). The owner corrects the
understanding before any change is proposed.

## Design as implemented

- A Dollyfile is a build recipe that `/bin/dollyfile` executes row by row inside
  Wasm. The C executor is the definition; JavaScript only lints, plans and renders.
- Identity is recipe text. `USE`, `FROM` and `COPY FROM` pin the referenced
  recipe's SHA-256, so each pin covers everything below it. Any upstream change
  changes every downstream hash and rebuilds it: complete replicability, by design.
- A root build starts from the externally supplied seed (compiler, Slop and
  executor sources, `bootstrap.dm` tools with byte digests). Everything else
  is built from pinned inputs.
- `HOST` inputs are published by the serving site and granted to the build as
  exact capabilities by the embedding page; `URL` inputs are external and need
  embedding policy. A recipe never grants itself network access.
- Execution is sequential, with no solver, prefetch, package manager or implicit
  extraction. Retention is explicit (`FILE`, `FOLDER`, exports, `FROM`/`COPY`
  results); the snapshot never walks the filesystem.
- `COPY FROM` a build-only image (no `display@0`) is the multi-stage mechanism:
  toolchains stay in builder images, shipped images copy exact outputs, and the
  consumer retains the builder's recipe chain in `/etc/dolly/recipes` as
  provenance (`read_artifact_receipt` appends it).
- Images, not modules, are cached: runtime build ID, root recipe hash and the
  digests of direct `FROM`/`COPY` artifacts.

## Gaps against that design (verified)

1. **Browser builds do not enforce pinned-only network access.** CI builds allow
   only the recipe graph's exact `SOURCE URL` inputs
   ([`build-snapshot-browser.mjs`](../../scripts/build-snapshot-browser.mjs)).
   `/IMAGE/rebuild/` and Studio builds use the page policy
   ([`browser.mjs`](../../src/browser.mjs) `buildNetwork`), which is unrestricted
   on the demo site, so a `SLOP curl …` can fetch unpinned bytes. The result is
   cached under the same replicable identity. Builds should always receive the
   exact inputs of their recipe graph and nothing else, whatever the page allows
   its running images.

## Questions for the owner

- **`HOST`/`URL` spelling.** The distinction stays. Candidate spellings, the same
  meaning in each: today's `SOURCE HOST /static/x DEST SHA` and `SOURCE URL https://… DEST SHA`;
  or naming the authority instead of the transport (`SITE` for inputs the serving
  site publishes, `URL` for external ones). Which reads best to you?
- **Build clock and entropy.** Snapshots ignore file times, but a build can
  embed the time or random bytes in file contents. Reproducibility is checked by
  rebuilding (`npm run image -- IMAGE --reproducible`), not prevented. Should
  builds run with a fixed `SOURCE_DATE_EPOCH`?
