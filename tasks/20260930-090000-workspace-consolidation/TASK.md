# Consolidate the checkout, worktrees and disk usage

- STATUS: CLOSED
- PRIORITY: 280
- TAGS: build,cleanup,iteration

The repository was spread across a stale root checkout (`rts-arena`, Sep 8, dirty),
`work/0ad-baseline` (main, dangling `dist -> /dev/shm/...`), `work/gpu-shaders` (the only
runnable tree, build/dist symlinked into its `.cache`), `work/core-iteration` (shared
`node_modules` symlinks), nine `~/dolly-audits` worktrees and five prunable `/tmp` entries.
`dist/static` held 32 symlinks into `~/dolly-audits`. Disk was 95% full.

## Evidence

Established: REPRODUCED. Verified before consolidation with `git worktree list`, `readlink -f
dist`, `du`, and `df -h /` (825 of 916 GB used).

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

One checkout on main with self-contained `build/`, `dist/`, `.cache/` and `node_modules/`.

## Result

Completed 2026-09-30.

- Uncommitted work preserved on `archive/rts-arena-root-wip-20260930`,
  `archive/http-concurrency-wip-20260930` and `archive/rts-handoff-wip-20260930`.
- 30 merged local branches deleted; six unmerged experiments renamed `archive/<name>`
  (native-zig, patti-codex-20260908, patti-ripgrep-20260908, rustc-in-dolly-20260908,
  tokio-dolly-20260908, wasm64-native-agent-20260907). Nothing pushed.
- Root `/home/daug/dev/dolly` now checks out `main`; all other worktrees removed and pruned;
  `~/dolly-audits` deleted.
- Kept outside the repo in `/home/daug/dev/dolly-archive/`: Slopyard private saves
  (`slopyard-migration-20260930`), the Sep 27/28 Slopyard checkpoints, the live Sep 25 domain
  and GitHub release directories (rollback), the Sep 30 integration logs, old agent work
  notebooks and small handover notes.
- Kept in the checkout: the working `dist/` (all 32 external symlinks materialized), runtime
  build outputs (`build/*.wasm`, `process-*`, `libdolly-*.a`, `generated`, `routes`, `runtime`,
  `native-zig`, `rust-sources`, `fluid-upstream`), `build/0ad`, merged source/toolchain caches
  in `.cache/` (LLVM, Zig, Emscripten, pinned sources, 0 A.D. bootstrap cache).
- Deleted: stale root `build/` (80 GB), browser test profiles, one-off verification builds and
  evidence directories, stale Rust seed build trees that did not match the pinned seed.
- `node_modules` reinstalled with `npm ci` (the shared copy was symlinks into a deleted
  worktree).
- Disk: 95% used -> about 46-54% used (worktrees for fix agents added afterwards).
- Verification in the root checkout: `node --test test/*.test.mjs` 287/287 pass; `node
  test/core-browser.mjs` passes in Chrome and Firefox; `DOLLY_BUILD_IMAGES=all node
  scripts/build-system-snapshot.mjs --plan` reports reuse for all 40 images.
