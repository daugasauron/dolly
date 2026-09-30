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

## GitHub Actions investigation (2026-10-01)

Facts: the repository is public, so standard hosted runners are free (4 CPUs,
16 GB RAM, 14 GB SSD; 6 h per job; 20 concurrent jobs); the dependency cache
is 10 GB per repository and cannot be raised; release assets must each stay
under 2 GiB (the largest snapshot, `zero-ad`, is 2,083,270,099 bytes).
Self-hosted runners are free but GitHub advises against them on public
repositories (fork pull requests can run code on the machine).

Measured locally: one image build keeps one core busy (Chrome at 100%,
5.8 GB resident). Last night's per-image times sum to 1.9 h; `codex-build`
(3,980 s) and `cmake-build` (1,190 s) dominate, and the longest chain is
system-build, rust-sdk, rust-build, protox-build, codex-build (about 70 min).

Plan:
1. Every push: source tests, `npm run build:runtime` with the LLVM wasm
   toolchain (1.6 GB) restored from a pinned release asset, and the core
   browser tests in Chrome and Firefox against the released images when the
   image inputs hash matches, else against freshly built core images.
2. Manual or nightly: the whole catalog from a fresh clone, one job per image
   along the recipe graph, snapshots passed as release assets; compare image
   identities with the local release. This is the reproducibility check that
   would have caught the client-archives bug.
3. Bootstrap inputs still built on the host (LLVM wasm toolchain, Rust seed,
   0 A.D. engine) come from pinned release assets until they are built inside
   Dolly. GPU tests stay local (no GPU on standard runners).
Independent of CI: build independent images concurrently (each uses one
core), and let Patti run crate compiles in parallel.
