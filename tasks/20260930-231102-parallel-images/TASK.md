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

## Done (2026-10-01, `work/parallel-images`)

`build-system-snapshot.mjs` starts each image in plan order once its
dependencies are complete, with `DOLLY_IMAGE_JOBS` builders (default: available
memory / 10 GiB, at most one per core). Builders after the first use
`.cache/snapshot-browser-profile-N`; the browser port now derives from the
profile path. Output lines are prefixed `[IMAGE]`; each build's log is in
`build/image-logs/IMAGE.log`. A failure skips only its dependents and fails the
command. Packs use unique temporary names and the process worker bundle is
renamed into place, since concurrent builds share `dist/`.

Measured with N = 3 (requested: other agents were building; load average
16–20 on 16 cores), forced full rebuild of `cbf79cb`'s recipes:

- Snapshots phase 1 h 53 min (09:20:00–11:12:35). The same builds summed to
  10,542 s (2 h 56 min), the serial time under that load. The root's
  concurrent serial rebuild finished 22 images (3,763 s; this run 4,001 s for
  them) and was stopped at its 2 h limit inside codex-build.
- The wall time is the critical path: codex-build took 5,310 s under load
  (3,980 s last night) and started at +24 min. At N = 3 protox-build waited
  4.5 min behind fd-build and ripgrep, which come first in plan order; with
  N ≥ 4 nothing on that path waits in this graph.
- Peak PSS per build: codex-build 16.6 GB (while exporting), all others ≤ 5 GB.
- Identities: the 22 images both runs built have equal snapshot digests,
  inputs and recipes. The other 17, rebuilt serially (`DOLLY_IMAGE_JOBS=1`),
  also match. codex-build has no serial build of this commit to compare.
- zero-ad failed as expected ("wrong dolly.process stamp"; stale host-built
  engine) and the other 40 images completed; the command exited 1. Killing the
  python-runtime build skipped python, gpu-sdk and gpu-fluid completed, and
  the command exited 1.

Evidence: `work/parallel-images/build/evidence/parallel-images-{full,failure,serial-check,studio-check}.log`.

Still open: the done-when asks for N ≥ 4; rerun with N ≥ 4 on a quieter
machine and compare codex-build with a serial build.
