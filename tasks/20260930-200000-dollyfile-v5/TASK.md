# Dollyfile v5 proposal (rejected)

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: dollyfile,design

Rejected by the owner on 2026-09-30. The proposal misread the design; its
replacement is `20260930-223000-dollyfile-design`.

Owner decisions:

- No lock files. Pins stay in the recipe text. A pin change upstream changes
  every downstream recipe hash and rebuilds everything below it. That is
  intended: every image is completely replicable from its recipe chain.
- No output-pinned or module-level caching (already rejected in v3: arbitrary
  reads, overwrites and deletions make declared outputs an unsound cache key).
- The HOST/URL distinction stays; only its spelling may improve.
- `COPY FROM` from build-only images is the multi-stage mechanism: toolchains stay
  in images that are only built, shipped images copy exact outputs, and the
  consumer retains the builder's full recipe chain as provenance.
