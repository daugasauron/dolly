# Build independent catalog images concurrently

- STATUS: OPEN
- PRIORITY: 240
- TAGS: build,images,iteration

Owner decision (2026-10-01): build independent images in parallel.

## Measured (2026-10-01)

- One image build keeps one core busy (its Chrome at 100%, 5.8 GB resident).
  This machine has 16 cores and 60 GB of RAM.
- Last night's per-image times sum to 1.9 h. The longest dependency chain is
  system-build → rust-sdk → rust-build → protox-build → codex-build, about
  70 min (codex-build alone 3,980 s); cmake-build takes 1,190 s.

## Work

- Schedule catalog builds along the recipe graph (`FROM`, `COPY FROM`, `USE`)
  with N concurrent builders, each in its own browser, starting an image once
  everything it depends on has finished.
- Keep shared outputs consistent: each image writes its own snapshot and
  metadata; the image registry and the static inputs are written once, by the
  coordinator.
- Keep build output readable: per-image logs, and the rebuild screen still
  shows the live output of the image it is building.
- Choose N from memory, not only cores (5.8 GB per build today).

## Done when

- A full catalog rebuild with N ≥ 4 yields the same image identities as a
  serial build, with the wall time recorded against the serial time.
