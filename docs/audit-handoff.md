# Audit handoff

## Checkpoint — 2026-09-08

Port 9000 serves application `2eeecd4`, immutable release
`79d7a92d9f176895ef6417aad936f0b39f3fd1f36770f6ae86c7aa4dc21a3a8b`.
The subsequent handoff update changes no runtime or image bytes.
No public push, deployment or hosting purchase has been performed.

Runtime identity:
`sha256:fb0a862d11295ce62e74b9fcceee496ff1f362caa87b11e5de41acdf2d4f4d5d`.
The canonical outer ABI is unchanged: exactly 28 imports and 128 exports,
including types (`build/dollyfile-stdin-outer-abi.log`). The kernel Wasm is
byte-identical; the compiler seed now contains the corrected Dollyfile executor.

## Validated work

- A manual Studio trial exposed a genuine build hang: `SLOP` inherited a terminal
  stdin even though the isolated builder cannot receive keyboard input. Build
  commands now receive `/dev/null`; explicit pipes and redirection remain normal
  shell operations. Native EOF/descriptor-cleanup regressions pass, as do the
  real-browser boundary, lifecycle, Slop and Dollyfile parser suites
  (`build/dollyfile-stdin-{parser-final,runtime-browser}.log`). A source-compiled
  Wasm probe also verifies non-TTY EOF with either terminal or piped caller stdin,
  explicit recipe input and preserved caller stdin
  (`build/dollyfile-stdin-direct-browser-green.log`). The expanded Studio
  regression fails on the old image (`build/studio-build-stdin-c-red.log`) and
  passes on the fix (`build/dollyfile-stdin-studio-browser.log`), including
  approve/build/stream/open, denial, failure and cancellation. Invalid exports show
  the expected object kinds; successful builds explain that their tools belong
  to the new image, not the calling Studio session.
  The full rebuild caught a Python recipe smoke test that assumed a terminal on
  stdin. It now checks noninteractive EOF; its raw-mode round-trip check moved
  intact into the real interactive Python browser fixture.
- All 260 source tests pass (`build/dollyfile-stdin-source-final.log`). All 19
  images completed genuine fresh-runtime builds
  (`build/dollyfile-stdin-{all-snapshots,snapshots-final}.log`); the first run's
  Python recipe failure and the successful correction are retained separately.
  All 19 packaged inventories passed before local publication
  (`build/dollyfile-stdin-publish.log`). The final live Studio check passes
  build/stream/open/cancellation, Pi startup and Neovim linting
  (`build/dollyfile-stdin-live-studio.log`).
  Named save/load also passes on the rebuilt Python/Pi image, including edits,
  deletions, credentials/history, corrupt/wrong-base rejection and preserved
  checkpoints (`build/dollyfile-stdin-session-browser.log`).
- The updated Studio snapshot builds in 8.7 seconds using cached bases. Pi
  startup, installed example linting, Neovim syntax, unsaved-buffer linting and
  save diagnostics pass (`build/dollyfile-stdin-studio-browser.log`).
  Interactive Neovim also passes shifted punctuation, Escape, `:w`, shell
  commands and `:q` recovery (`build/dollyfile-stdin-neovim-browser.log`).
- Quiet-child SIGCHLD is delivered only once the child is waitable. Cancellation,
  escalation, descriptors, pipes, nested-shell recovery and `tar -xf -` pass
  in real browsers (`build/sigchld-tar-lifecycle-browser.log`). Boundary,
  C/C++ process/DSO probes, Git HTTP clone/fetch/push/cancellation, libcurl,
  77 Slop regressions and Make propagation pass
  (`build/sigchld-checkpoint-browser.log`). The new catalog also passes Git
  clone/fetch/push, cancellation and lock cleanup
  (`build/dollyfile-stdin-git-browser.log`).
- Pi's fake npm success was removed. Pi TUI, incremental output and fixture-backed
  write/edit calls pass (`build/dollyfile-stdin-pi-browser.log`). Python child
  streaming, cancellation, Bonnie's real PEP 517 build/cleanup, interactive stdin
  and ctypes callbacks pass (`build/dollyfile-stdin-python-browser.log`).
- Prebuilt launches and derived builds no longer download the 113 MB compiler
  seed. A genuine Ghostty root rebuild still works. Release-pinned assets use
  immutable caching; repeated kernel/loader reads transfer zero bytes
  (`build/lazy-kernel-seed-browser.log`,
  `build/lazy-kernel-seed-port9000-cache.log`).
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
- Recipe pin updates now distinguish digest operands from identical text in
  paths and comments. A behavioral regression fails on the old updater; the
  fixed updater preserves formatting and remains byte-identical on a second run
  (`build/pin-operands-{before,after}.log`).
- Qwen history now preserves the empty thinking markers required in the current
  tool round and separates assistant text from tool calls correctly. Regression
  tests pass, but this did not make independent recipe authoring reliable.
  The README is shorter and no longer makes stale phone/login claims.
- Actual Chrome navigation measured 43,507,555 response-body bytes cold and
  121,102 warm for default; Studio used 78,186,172 cold and 155,792 warm.
  Snapshot-ready times were 1.12/1.12 seconds and 2.23/2.13 seconds respectively
  (`build/{default,studio}-cold-boot-final.log`). These are single local,
  unthrottled cold/warm pairs, not WAN or fully interactive Pi timings. They
  exclude protocol overhead and GPU model weights; a fresh profile measured
  each image, including Worker requests.
- CPython's personal bootstrap path was removed at source preparation; all three
  Python snapshots are clean of that path. The expanded release scan covered
  1,121 files, 48,875 tar members, 18,875 snapshot records and 1,067 nested ZIP
  members. No checked Dolly personal-path or OpenRouter-key patterns matched.
  All 13 private-key blocks matched pinned upstream CPython test fixtures
  byte-for-byte (`build/public-artifact-fixture-provenance.log`). The new release
  introduces no new flagged bodies
  (`build/dollyfile-stdin-artifact-privacy{,-comparison}.log`). The tracked-source
  scan also has no checked personal-path/key matches
  (`build/dollyfile-stdin-source-privacy.log`).
  The 16 unparsed archive occurrences also match pinned Zig/CPython fixtures
  byte-for-byte (`build/public-artifact-unparsed-provenance.log`).
  This is a bounded pattern scan, not proof that every possible secret encoding
  or unsupported archive format was inspected.

## Outstanding issues

1. **Local Pi reliability and recovery.** Guided Qwen 4B starters pass, but
   independent 2B/4B author/build/debug/open remains unreliable. Shorter,
   template-first guidance helped preserve pins, repair a compiler error in the
   recipe and open a result; that program still returned 0 for two newline-
   terminated lines. Other trials invented syntax or tested commands in Studio
   instead of the built image. The latest trial repaired an export declaration
   and a missing C header, then exposed the build-stdin hang fixed above. Its
   correctness was not established. A successful build is not proof of correct code.
   Ctrl+C returns 130; the two-second cancellation fallback can unload the model.
   The shell/files survive, and explicit cached reload restores real Pi tool use.
   An unloaded-model error can nevertheless give Pi exit 0; inspect its final
   assistant message. Independent author/repair/run remains unproven. Preserve
   `build/studio-manual-evidence/` and the cached GPU profile.
2. **Missing Pi search tools.** Genuine fd/ripgrep are not installed. Resolve the
   Rust bootstrap boundary: pinned external compiler versus an in-Dolly compiler.
   fd's single-thread option still creates threads. Do not ship renamed substitutes
   or represent externally compiled tools as source-built inside Dolly.
3. **Custom-image persistence.** Uploaded recipes cannot yet use named-session
   save/load. Result URLs refer to this browser's verified cache, not portable
   images or persistent sessions. Preserve exact image identity when extending it.
   Existing named saves are build-specific; incompatible records are retained,
   but there is no cross-build migration or export UI.
4. **Final release review and hosting.** Static export is verified; provider
   selection, WAN/load testing and production retention are not.
   The release is about 775 MB, including 124 MB of compressed snapshot packs;
   seven individual assets exceed 25 MiB. Root rebuilds still download the 113 MB
   seed, which Chrome did not cache. Keep prior `_dolly/` releases and packs for
   open tabs: an ordinary one-release GitHub Pages deployment does not do this.
   Review remaining source/docs. Upstream model build paths and public certificate
   and archive fixtures are not Dolly user data and should not be blindly deleted.
5. **Build cost and disk pressure.** Fresh-runtime CMake took 1,143 seconds,
   Neovim 222 seconds and Python 100 seconds; cached Studio assembly took 9 seconds.
   About 5 GiB of development disk remains after publication. Two reproducible
   static-test exports were removed earlier; their logs and source releases are
   retained. Preserve user caches and releases.

GPU guidance, home-page sorting, approved Studio build/log/open and the Foundry
bhop expansion are implemented and browser tested. See the
[overnight plan](overnight-plan.md) for the original requested scope.

## Isolated Codex experiment

Branch `codex/wasm64-native-agent-20260907` is clean and paused at `afde252`.
Its worktree's `CODEX-HANDOFF.md` contains reproduction steps and evidence.
No experimental Rust patches were merged into main.

Real browser proofs cover upstream execpolicy, process waits/cancellation,
Responses/SSE, layered configuration, installed upstream defaults and now the
actual AuthManager's API-key loading/cache/rotation notifications/logout. The
real TOML/layer/CLI-override and managed-requirement loaders now produce the
AuthConfig, replacing fixture-constructed configuration in that proof. The
storage factory selects upstream's existing default cloud loader for
its private API-key manager without constructing an unused native cloud client.
That loader feeds production configuration and Responses. The production model
client's HTTP constructor now delegates to the same broker-backed transport seam
exercised in browser tests, including default headers and explicit overrides.
Those proofs pass twice per run (`codex-default-transport-browser{2,3}.log` in the
experiment's build directory). Native libraries and the target type-check;
native test execution is not established. The cloud library's native graph shrank
from 1,229 to 930 units by reusing the existing client backoff helper. Exact outer
ABI checks pass. No new host capability was added. OAuth and unresolved auth fail
explicitly; no live credentials were used for these fixture-backed tests.

**The full Codex agent does not run.** Real ConfigBuilder/ModelClient/CLI
integration remains unported; the previous core target check failed on 29 Tokio
socket errors. The next production seam is the models-list transport constructor.
The native thread/socket dependency graph must
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
