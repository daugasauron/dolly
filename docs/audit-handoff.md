# Audit handoff

## Checkpoint — 2026-09-08

Feature work is paused at the user's requested checkpoint. Port 9000 serves
application `4b61edf`, immutable release
`61a9688a0e2537179f4ee7037100abf0b9fa83d6ad855cf8761951534fdb7e1d`.
The subsequent archive-writer and browser-test fixes do not change its runtime
or images. No public push, deployment or hosting purchase has been performed.

Runtime identity:
`sha256:79b64cf05defff93afedad28f306c23a7f2be37f744f2f02c93b6bcd6364bc35`.
The canonical outer ABI is unchanged: exactly 28 imports and 128 exports,
including types (`build/sigchld-checkpoint-outer-abi.log`).

## Validated work

- All 258 source tests pass (`build/checkpoint-archive-final-source.log`).
  All 19 images completed genuine fresh-runtime builds, then passed packaged
  inventories before publication (`build/sigchld-tar-snapshots.log`,
  `build/static-deployment-publish.log`). A final live port-9000 inventory and
  headerless static-export session test pass
  (`build/checkpoint-port9000-final.log`, `build/checkpoint-static-session-final.log`).
- Quiet-child SIGCHLD is delivered only once the child is waitable. Cancellation,
  escalation, descriptors, pipes, nested-shell recovery and `tar -xf -` pass
  in real browsers (`build/sigchld-tar-lifecycle-browser.log`). Boundary,
  C/C++ process/DSO probes, Git HTTP clone/fetch/push/cancellation, libcurl,
  77 Slop regressions and Make propagation pass
  (`build/sigchld-checkpoint-browser.log`).
- Pi's fake npm success was removed. Pi TUI, incremental output and fixture-backed
  write/edit calls pass (`build/sigchld-checkpoint-pi-browser.log`). Python child
  streaming, cancellation, Bonnie's real PEP 517 build/cleanup, interactive stdin
  and ctypes callbacks pass (`build/checkpoint-final-python-browser.log`).
- Prebuilt launches and derived builds no longer download the 113 MB compiler
  seed. A genuine Ghostty root rebuild still works. Release-pinned assets use
  immutable caching; repeated kernel/loader reads transfer zero bytes
  (`build/lazy-kernel-seed-browser.log`,
  `build/lazy-kernel-seed-port9000-cache.log`). Wasm/seed identities are unchanged.
- Static export now preserves versioned assets, clean navigation and correct
  service-worker scope, including a nested `/dolly/` deployment. Real headerless
  browser checks pass for isolation, approved build/log/open, cancellation,
  named-session restore and cache/derived-build iteration
  (`build/static-export-{isolation,build,iteration}-browser.log`,
  `build/static-export-session-final.log`). See [deployment](deployment.md).
- Source archives now reject explicitly supplied symlinks, complete short writes
  and own unique staging with failure cleanup. Behavioral regressions fail on
  the old writer and pass on the fix. Regenerating all prepared sources preserved
  every prior byte hash (`build/source-tar-audit-before-final.log`,
  `build/checkpoint-source-archives-{before.sha256,prepare.log}`).
- CPython's personal bootstrap path was removed at source preparation; all three
  Python snapshots are clean of that path. The expanded release scan covered
  1,121 files, 48,874 tar members, 18,874 snapshot records and 1,067 nested ZIP
  members. No checked Dolly personal-path or OpenRouter-key patterns matched.
  All 13 private-key blocks matched pinned upstream CPython test fixtures
  byte-for-byte (`build/public-artifact-{expanded-scan,fixture-provenance}.log`).
  This is a bounded pattern scan, not proof that every possible secret encoding
  or unsupported archive format was inspected.

## Outstanding issues

1. **Local Pi reliability.** Default Qwen 2B is unreliable for independent
   author/build/debug/open. Guided 4B starters pass, but a manual trial generated
   incorrect line-counting code, hit compile errors and edited disposable builder
   paths instead of the recipe. The next attempt reported that the model was no
   longer loaded. The corrective Studio skill is not behaviorally validated.
   Pi may exit 0 despite a final assistant error; tests must inspect that message.
   Preserve `build/studio-manual-evidence/` and the cached GPU profile. Next: one
   complete real 4B author/repair/run trial, checking program output and recovery.
2. **Missing Pi search tools.** Genuine fd/ripgrep are not installed. Resolve the
   Rust bootstrap boundary: pinned external compiler versus an in-Dolly compiler.
   fd's single-thread option still creates threads. Do not ship renamed substitutes
   or represent externally compiled tools as source-built inside Dolly.
3. **Custom-image persistence.** Uploaded recipes cannot yet use named-session
   save/load. Result URLs refer to this browser's verified cache, not portable
   images or persistent sessions. Preserve exact image identity when extending it.
4. **Final release review and hosting.** Static export is verified; provider
   selection, total cold-load measurement and production retention are not.
   The release is about 775 MB, including 124 MB of compressed snapshot packs;
   seven individual assets exceed 25 MiB. Root rebuilds still download the 113 MB
   seed, which Chrome did not cache. Keep prior `_dolly/` releases and packs for
   open tabs: an ordinary one-release GitHub Pages deployment does not do this.
   Review remaining source/docs and unsupported nested archive fixtures; the scan
   recorded 16 unparsed fixture occurrences. Upstream model build paths and public
   certificate fixtures are not Dolly user data and should not be blindly deleted.
5. **Build cost and disk pressure.** Fresh-runtime CMake took 1,170 seconds,
   Neovim 222 seconds and Python 102 seconds; cached Studio assembly took 9 seconds.
   About 8 GiB of development disk remains. Review owned, reproducible validation
   exports before another cold build; preserve user caches and pinned releases.

GPU guidance, home-page sorting, approved Studio build/log/open and the Foundry
bhop expansion are implemented and browser tested. See the
[overnight plan](overnight-plan.md) for the original requested scope.

## Isolated Codex experiment

Branch `codex/wasm64-native-agent-20260907` is clean and paused at `64d6d44`.
Its worktree's `CODEX-HANDOFF.md` contains reproduction steps and evidence.
No experimental Rust patches were merged into main.

Real browser proofs cover upstream execpolicy, process waits/cancellation,
Responses/SSE, layered configuration, installed upstream defaults and now the
actual AuthManager's API-key loading/cache/rotation notifications/logout. The
cached credential feeds the real BearerAuthProvider and Responses client. Native
libraries type-check; exact outer ABI checks pass. No new host capability was
added. OAuth and other unsupported modes fail explicitly; no live credentials
were used for these fixture-backed tests.

**The full Codex agent does not run.** Higher-level auth factories and real
ConfigBuilder/CLI integration remain unported; the previous core target check
failed on 29 Tokio socket errors. The native thread/socket dependency graph must
be separated, not satisfied by host fallbacks. There is no in-Dolly Rust SDK.
Experiment processes are stopped.

## Handoff rules

Keep port 9000 on published releases, never mutable source or `dist`.
`build/releases/current/release/source.commit` identifies the served source.
Preserve `.pi/`, `.pi-subagents/`, `work/`, reusable module caches,
`build/d6-source-cache-backup.v3dj1y`, old pinned releases and failed-test evidence.

These checks do not establish full POSIX/Node/libcurl compatibility,
Safari/phone/audio support, complete cleanup after forced Worker termination,
or a formal containment proof. Follow [AGENTS.md](../AGENTS.md).
