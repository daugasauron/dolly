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

- All 254 source checks pass, including the catalog-wide snapshot-identity test
  (`build/checkpoint-final-source.log`). All 19 images completed the genuine
  fresh-runtime build (`build/sigchld-tar-snapshots.log`).
- Browser lifecycle checks pass: SIGCHLD handlers/masking/wait readiness,
  cancellation/escalation/recovery, descriptors and the real
  `gzip -dc archive.tgz | tar -xf -` pipeline
  (`build/sigchld-tar-lifecycle-browser.log`).
- Boundary, C/C++ process/DSO probes, Git HTTP clone/fetch/push/cancellation,
  libcurl and 77 Slop regressions plus Make failure propagation pass
  (`build/sigchld-checkpoint-browser.log`).
- Pi TUI, incremental child/model output and fixture-backed write/edit calls
  pass (`build/sigchld-checkpoint-pi-browser.log`).

The final cleanup removes a personal bootstrap-interpreter path from CPython's
generated configuration by mounting its actual installation at a canonical
container path. A regression test checks the prepared archive, not script text.
Studio's skill now directs compiler-error repairs to the recipe, not the
disposable builder's filesystem; it no longer requires reading the entire manual
before a small edit. This instruction change is not proof of model reliability.

## Local release and verification

Port 9000 serves application checkpoint `03be879`, release
`1481b83450773e32531757f077b50117f4291e4e3e6360f9b7df330dc4c6fbe4`.
All 19 packaged image inventories passed before atomic local publication
(`build/checkpoint-final-publish.log`). The previous release is retained for
already-open pinned tabs. No builder or manual model experiment is left running.

The runtime identity is:
`sha256:79b64cf05defff93afedad28f306c23a7f2be37f744f2f02c93b6bcd6364bc35`.

The final Python/Studio snapshot refresh and all 254 source tests pass
(`build/checkpoint-final-{snapshots,source}.log`). Python children, streaming,
cancellation, Bonnie's real PEP 517 build/cleanup, interactive stdin and ctypes
callbacks pass (`build/checkpoint-final-python-browser.log`). All three Python
snapshots contain no personal builder-home path in any retained file
(`build/checkpoint-final-python-paths.log`). Studio's Pi startup, example linting
and Neovim syntax/diagnostics pass (`build/checkpoint-final-studio-browser.log`).
Actual port-9000 Studio build/log/open, denial, failure and cancellation checks
pass, as do default-image signal/descriptor/pipe and nested-shell recovery checks
(`build/checkpoint-final-port9000.log`).
No public push, deployment or hosting purchase has been performed.

## Outstanding issues

1. **Local Pi reliability.** Default Qwen 2B is not reliable for the independent
   author/build/debug/open workflow. Guided 4B starters now pass all three tasks
   (`build/studio-qwen4-starters-browser.log`), but that is not proof of
   independent authoring or scratch cleanup. The new manual 4B trial produced
   a syntactically valid recipe with incorrect line-counting C code. Two approved
   builds exposed compiler errors; Pi then tried editing the builder's `/tmp`
   files in Studio instead of its recipe. The next attempt failed because the
   local model was no longer loaded, so the skill correction is not yet
   behaviorally validated. Earlier trials also hit token limits and repeated calls.
   Pi can exit 0 even when its final assistant message reports an error; tests
   now inspect that result. Evidence: `build/studio-manual-evidence/`.
   An official-sampling comparison did not fix 2B and was reverted
   (`build/studio-qwen-sampling-browser.log`). A real cold 4B download and load
   succeeded on localhost:9000; cancellation/reload recovery still needs a
   complete run. Manual experiment browsers are stopped; evidence is retained.
2. **Missing Pi search tools.** Genuine fd/ripgrep are not installed. The Rust
   bootstrap choice remains unresolved: pinned external Rust compiler, or
   compilation entirely inside Dolly. fd's single-thread option still creates
   threads; it is not a serial implementation. Do not ship renamed substitutes.
3. **Custom-image persistence.** Uploaded recipes cannot yet use named-session
   save/load. Build results open from this browser's verified cache; their URL
   alone is neither a portable image nor a persistent session. Preserve exact
   image identity when extending this.
4. **Release audit and hosting.** The full source/artifact/privacy review and
   cold-load measurement are unfinished. The packaged site is about 775 MB,
   including 124 MB of compressed snapshot packs.
   Seven assets exceed 25 MiB, the
   [Cloudflare Pages per-file limit](https://developers.cloudflare.com/pages/platform/limits/);
   the site cannot be uploaded there unchanged. Provider-neutral asset routing,
   caching, compression and isolation headers still need deployment validation.
   CPython's personal-path leak is fixed at source preparation, but the complete
   compressed-artifact scan remains unfinished. Pinned upstream model binaries
   contain upstream authors' build paths; these are not Dolly user data. Other
   archive pattern matches need classification, not automatic deletion or a
   claim that every private-key-shaped test fixture is a leaked credential.
   No host/proxy capability was added to address hosting.
5. **Build cost and disk headroom.** The latest fresh-runtime CMake build took
   1,170 seconds, Neovim 222 seconds and Python 102 seconds; cached Studio assembly
   took 9 seconds. The development disk is 99% full, with about 15 GiB free.
   Review owned build outputs before another cold build; do not delete user
   caches or releases needed by open pinned tabs.

GPU guidance, home-page sorting, approved Studio HTTP build/log/open and the
Foundry bhop expansion are implemented and browser tested. Completed details
remain in Git history; remaining requested scope is in
[the overnight plan](overnight-plan.md).

## Isolated Codex experiment

Branch `codex/wasm64-native-agent-20260907` is clean and paused at `d84e8af`.
See its `CODEX-HANDOFF.md` before reuse; no experimental Rust patches were merged.

Real browser proofs cover upstream execpolicy and the Responses/SSE path:
auth headers, retries, Unicode streaming, typed errors, cancellation and reuse.
Real browser configuration/provider/API-key storage round-trips now also pass,
using fixture credentials. The actual `codex-exec` target still fails on 29 Tokio
socket errors. Its production startup requires an OS thread, multithread Tokio,
an embedded app-server and native-heavy executor services; the normal graph has
814 target build units. Fixing async filesystem calls alone is insufficient.
The next clean port step is separating real local executor/AuthManager code from
unavailable native services, not adding socket/thread stubs or a substitute CLI.
**The full Codex agent does not run.** No experiment processes remain.

## Handoff rules

Keep port 9000 on published releases, never mutable source or `dist`.
`build/releases/current/release/source.commit` identifies the served source.
Preserve `.pi/`, `.pi-subagents/`, `work/`, reusable module caches,
`build/d6-source-cache-backup.v3dj1y` and failed-test evidence.

These checks do not establish full POSIX/Node/libcurl compatibility,
Safari/phone/audio support, complete cleanup after forced Worker termination,
or a formal containment proof. Follow [AGENTS.md](../AGENTS.md).
