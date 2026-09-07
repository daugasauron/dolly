# Audit handoff

## Source checkpoint — 2026-09-08

Functional checkpoint `026ec83` fixes quiet-child SIGCHLD notification and
`tar -xf -`. Notification is queued only after the child becomes waitable;
the default disposition does not overwrite a normal exit status. Tar owns a
duplicate of stdin and retries interrupted I/O. These are real Wasm changes,
not host fallbacks. The outer ABI is unchanged: 28 imports and 128 exports,
including exact types (`build/sigchld-checkpoint-outer-abi.log`).

Earlier checkpoint `9631648` removed Pi's fake npm command and corrected stale
environment instructions. Missing npm now fails instead of pretending an install
succeeded. Pi startup tests wait for freshly rendered readiness, not a fixed delay.

Verification of the new runtime:

- 252 source checks pass (`build/sigchld-checkpoint-source.log`). The single
  catalog-wide snapshot-identity test was explicitly excluded while snapshots
  were being regenerated; this is **not** the complete 253-test run.
- Browser lifecycle checks pass: SIGCHLD handlers/masking/wait readiness,
  cancellation/escalation/recovery, descriptors and the real
  `gzip -dc archive.tgz | tar -xf -` pipeline
  (`build/sigchld-tar-lifecycle-browser.log`).
- Boundary, C/C++ process/DSO probes, Git HTTP clone/fetch/push/cancellation,
  libcurl and 77 Slop regressions plus Make failure propagation pass
  (`build/sigchld-checkpoint-browser.log`).
- Pi TUI, incremental child/model output and fixture-backed write/edit calls
  pass (`build/sigchld-checkpoint-pi-browser.log`).

## Local release and in-flight build

Port 9000 still serves the complete application checkpoint `e633777`, release
`14e9b8a21cf303e3ce46f95c4928d16f1ed11a39bba609aca35a7a93341ed20a`.
All 19 packaged inventories and the actual port-9000 Studio build/log/open,
denial, failure and cancellation checks passed
(`build/checkpoint-request-{publish,port9000}.log`).
The new Pi/kernel/tar changes have **not** been promoted there.

The already-running `DOLLY_BUILD_IMAGES=all npm run snapshot` is preserved.
At this checkpoint nine images have completed; CMake is rebuilding.
Follow `build/sigchld-tar-snapshots.log`; do not start a duplicate builder or
edit its source/recipe inputs. This is a genuine fresh-runtime build, not
re-keyed old snapshots. New runtime identity:
`sha256:79b64cf05defff93afedad28f306c23a7f2be37f744f2f02c93b6bcd6364bc35`.

Next checkpoint step: after the builder succeeds, run the **unfiltered**
`node --test test/*.test.mjs`, publish all 19 images locally, and retest port 9000.
Keep the previous whole-app release until that succeeds. No public push,
deployment or hosting purchase has been performed.

## Outstanding issues

1. **Local Pi reliability.** Default Qwen 2B is not reliable for the independent
   author/build/debug/open workflow. Guided 4B starters now pass all three tasks
   (`build/studio-qwen4-starters-browser.log`), but that is not proof of
   independent authoring or scratch cleanup. Manual trials produced token-limit
   failures, repeated tool calls, and a recipe omitting the requested C command.
   Pi can exit 0 even when its final assistant message reports an error; tests
   now inspect that result. Evidence: `build/studio-manual-evidence/`.
   An official-sampling comparison did not fix 2B and was reverted
   (`build/studio-qwen-sampling-browser.log`). Cold GPU download/recovery also
   needs another run; an earlier debugger disconnect has no established cause.
2. **Missing Pi search tools.** Genuine fd/ripgrep are not installed. The Rust
   bootstrap choice remains unresolved: pinned external Rust compiler, or
   compilation entirely inside Dolly. fd's single-thread option still creates
   threads; it is not a serial implementation. Do not ship renamed substitutes.
3. **Custom-image persistence.** Uploaded recipes cannot yet use named-session
   save/load. Build results open from this browser's verified cache; their URL
   alone is neither a portable image nor a persistent session. Preserve exact
   image identity when extending this.
4. **Release audit and hosting.** The full source/artifact/privacy review and
   cold-load measurement are unfinished. The published site contains 772,296,052
   regular-file bytes, including 123,967,440 compressed snapshot-pack bytes.
   Seven assets exceed 25 MiB, the
   [Cloudflare Pages per-file limit](https://developers.cloudflare.com/pages/platform/limits/);
   the site cannot be uploaded there unchanged. Provider-neutral asset routing,
   caching, compression and isolation headers still need deployment validation.
   No host/proxy capability was added to address this.
5. **Build cost and disk headroom.** Previous uncached CMake took 1,434 seconds,
   Neovim 264 seconds, versus roughly 10 seconds for cached Studio assembly.
   The development disk is 98% full, with about 24 GiB free at checkpoint.
   Review owned build outputs before another cold build; do not delete user
   caches or releases needed by open pinned tabs.

GPU guidance, home-page sorting, approved Studio HTTP build/log/open and the
Foundry bhop expansion are implemented and browser tested. Completed details
remain in Git history; remaining requested scope is in
[the overnight plan](overnight-plan.md).

## Isolated Codex experiment

Branch `codex/wasm64-native-agent-20260907` is clean and paused at `4f77a9a`.
See its `CODEX-HANDOFF.md` before reuse; no experimental Rust patches were merged.

Real browser proofs cover upstream execpolicy and the Responses/SSE path:
auth headers, retries, Unicode streaming, typed errors, cancellation and reuse.
The latest configuration/provider/API-key storage work passes wasm64 and native
compile checks only. Browser login/config round-trip, AuthManager/full CLI,
process-group lifecycle and reachable Tokio asynchronous filesystem paths remain
unfinished. **The full Codex agent does not run.** No experiment processes remain.

## Handoff rules

Keep port 9000 on published releases, never mutable source or `dist`.
`build/releases/current/release/source.commit` identifies the served source.
Preserve `.pi/`, `.pi-subagents/`, `work/`, reusable module caches,
`build/d6-source-cache-backup.v3dj1y` and failed-test evidence.

These checks do not establish full POSIX/Node/libcurl compatibility,
Safari/phone/audio support, complete cleanup after forced Worker termination,
or a formal containment proof. Follow [AGENTS.md](../AGENTS.md).
