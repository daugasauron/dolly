# Audit checkpoint

Audit baseline closed 2026-09-06 at `91a7fa2`. Its verification below describes
that source, not subsequent changes. Broader work belongs in the [roadmap](roadmap.md);
API scope is the user's design choice, not an operation-profiling exercise.

## Signal cleanup and Git push follow-up

The current follow-up implements process-local signal handlers and bounded
delivery/acknowledgment, child cleanup before parent retirement, and rapid
second-Ctrl-C job termination. It removes the page's destructive automatic
reload fallback. Git HTTP push uses serial in-Wasm sideband spooling; tests
verify remote content/refs, rejection, interruption and recovery. Network
authority is unchanged; no raw sockets or CORS bypass was added.

All five images, 203 source tests and the complete Chrome suite passed, plus
gamedev framebuffer/cancellation checks. Python handler cleanup and QuickJS
CPU-loop SIGTERM are covered. The copied process libc excludes Emscripten's
replaced signal objects, so `-rdynamic`/DSO hosts have one signal-state owner.
Runtime: `sha256:2802a696066ccdf59d43768512cacd79a02e0bc42a24dccb07d7ec34a52c9851`.
Evidence: `build/signal-push-all-snapshots.log`,
`build/signal-push-source-suite-final.log`, `build/signal-push-browser-suite-final.log`
and `build/signal-push-gamedev-browser.log`. Earlier failed runs remain available.
This follow-up used the existing seed toolchain/cache; it is not a new cold-bootstrap proof.

## Dollyfile v3 integration

Integrated the surviving `codex/dollyfile-v3` branch, preserving the signal,
Git and image-owned startup changes above. Modules remain sequential and
permissive; only completed images are cached. TOOL exports resolve on PATH and
retain that output, runtime ENV overrides remain authoritative, and the C/JS
parsers agree on empty commands and image-name limits. No browser imports changed.

All five v3 images, 191 source tests and the complete Chrome suite passed.
The addon test verifies sealed/restored PATH outputs, edited commands, cache
reuse and invalidation when base bytes change without changing the base recipe.
Runtime: `sha256:f8a9a548a07d5f58a191e0d37cef7bf2d2c8e6db34717fa59452423bc12267c1`.
Evidence: `build/v3-integration-snapshots.log`, `build/v3-integration-source-2.log`
and `build/v3-integration-browser.log`. Earlier failing iteration runs exposed a
test startup assumption: a custom Slop entry is not the catalog's Pi entry.

Source-only preparation is committed as `cae5c91`. Local source edits stage and
refresh HOST pins without rebuilding the kernel. The 10-image catalog now has
explicit system, JavaScript, Pi, Python and graphics SDK boundaries. Narrow COPY
rows reuse one decoded input; Python3 is a symlink, stdlib tests are omitted,
and the graphics SDK retains no stale objects. Python+Pi is 336.2 MB instead of
381.8 MB; startup-only default/Pi stages built in 3.9/6.6 seconds.

All 10 snapshots, 192 source tests and the complete Chrome suite passed, including
actual-base-byte invalidation, Python/Bonnie, Git push, cancellation and sessions.
Runtime: `sha256:307af62359ab8dd88b42dc18900601bf7aae0256a86cdeb05b7225cb96fdda14`.
Evidence: `build/v3-boundaries-snapshots-2.log`,
`build/v3-boundaries-source-suite-2.log`, `build/v3-boundaries-browser-suite.log`.
The first SDK attempt caught an incorrectly indented FILE declaration in its
extracted Makefile; the original failure log remains available.

Remaining v3 work: stable small packs and redundant restore/copy costs. Singularity is
now the source-built gamedev demo: real orbital forces, projectiles, pulses and
in-Wasm controls. The separate gamedev-phone image reuses that responsive program;
phone menus, Pi command injection and touch-scroll translation were removed from
the host. No browser contract changed. 192 source tests and desktop/portrait
graphics checks passed, including raw touch drag/EXIT and Ctrl-C shell recovery
(`build/singularity-deploy-source-2.log`, `build/singularity-deploy-graphics.log`).
The broader rerun is logged in `build/singularity-deploy-browser.log`.
Current native-agent blockers are in
[port status](port-status.md#native-agent-compatibility-investigation).
The external audit survives at `/home/daug/dolly-audits/v3-3c8e352`; its old
temporary worktree does not.

## Airtime local follow-up

The separate `/bhop/` image adds a source-built first-person strafe-jumping
course without replacing Singularity. Its movement checks run both natively and
inside Dolly. Display mailbox v5 adds only user-click-gated pointer capture and
bounded relative input records; no Wasm import was added. Escape releases capture,
and Q/Ctrl-C restore the terminal and preserve files. Rendering now clears depth
each frame; a browser pixel check catches disappearing platforms after jumping.

All 12 snapshots build and 193 source tests pass. Focused real-browser evidence:
`build/bhop-browser-final.log`, `build/bhop-singularity-regression.log`, and
`build/bhop-boundary.log`. Runtime:
`sha256:7fd76651d919daea0874797fa23426c0e53ea11a2db2480f996408dfa43c8ec5`.
This is not a fresh cold-bootstrap or Firefox pointer-capture proof.

## Lazy image artifact loading

Dependency resolution now reads descriptors; only direct worker inputs load
snapshot bytes. A cached Pi addon reads 294.9 MB from one payload and downloads
no ancestor snapshots. Fresh/cached/edited addon builds took 6.6/5.9/6.0 seconds
on the development machine. Missing Pi rebuilt its small stage from Pi-runtime
before the addon, without rebuilding its ancestors.

Metadata, payload and old-version cleanup commit atomically. Browser tests cover
changed base bytes under an unchanged recipe, stale selected digests, corrupt
payload recovery to exact published bytes, injected quota failure, simultaneous
writers, and schema migration preserving the separate named-session record.
193 source tests and the complete Chrome suite passed:
`build/lazy-artifacts-source-complete.log`,
`build/lazy-artifacts-browser-complete.log`. The earlier broad run passed its
individual checks but its launcher was edited while executing and ended with
a shell EOF; the unchanged rerun passed. Runtime and snapshot bytes are unchanged.
The local release at port 9000 also passed addon rebuild/cache/failure tests and
desktop/portrait graphics checks (`build/lazy-artifacts-port9000-final.log`,
`build/lazy-artifacts-gamedev-port9000.log`). The harness now honors the requested
external server for rebuild routes; its first mislabeled port-9000 run had used
the fixture server. The corrected run loaded eight published Pi packs, then only
the cached Pi payload on subsequent builds.

## Completed

- One short, explicit browser HTTP boundary with bounded admission, typed
  failures, cancellation, binary bodies and enforced embedding policy.
  [Review map](browser-boundary.md), [HTTP contract](http.md).
- Private processes, honest descriptor inheritance/locking behavior, genuine
  C++ libraries and process-local DSOs; image-owned startup and recovery.
  [Process model](process-model.md), [Dollyfiles](dollyfile.md).
- Image-owned Bonnie build policy, fresh NumPy/Pandas source builds and ordinary
  Git HTTP clone/fetch. Unsupported behavior remains explicit.
  [Port status](port-status.md).
- Recipe-bound named sessions, coherent atomic publication, dirty-source
  verification and accurate packaged documentation/help.
  [Sessions](sessions.md), [sources](sources.md).

## Final verification

An isolated checkout began without build caches or `node_modules`, used a
separate empty npm cache and an explicit host-tool PATH, and completed the
documented `npm ci` → `scripts/build-toolchain.sh` → `npm test` procedure
without interruption. All five image builds, 203 source tests and the complete
Chrome suite passed, including Git, Pi, Python/Bonnie, lifecycle/cancellation,
sessions, C++ and Zig.

The cold-built kernel Wasm/data and all five system snapshots are byte-identical
to the published artifacts. Runtime:
`sha256:3fa9475da90995caf3b6566653827a2dcc51b859fe5b2a19c7d2ede1cd5acba5`.

Additional checks against port 9000 passed named save/load on all five images
and a fresh `bonnie install pandas`, including NumPy, frontend dependencies,
array/groupby operations and temporary-state cleanup. One gamedev session test
lost its debugger context during navigation; the unchanged rerun passed and
the original log is retained. This was not a reproduced Dolly runtime failure.

Local evidence:

- `build/d1-final-cold-bootstrap.log`, `build/d1-final-run-record.md`.
- `build/final-cold-runtime-identity.log`, `build/final-cold-image-identity.log`.
- `build/final-session-*.log`, `build/final-port9000-pandas.log`.
- `build/git-transport-publication.log`, `build/git-transport-port9000.log`,
  `build/git-transport-release-verification.log`.
- `build/final-release-negative.log`: mixed/tampered artifacts rejected;
  the current release preserved.

## Handoff rules

Port 9000 serves a published whole-app release, never mutable source or `dist`.
`build/releases/current/release/source.commit` identifies its functional source.
Nothing from this checkpoint was pushed or remotely deployed. A new publication
is required to change the served app; keep older releases for open pinned tabs.

Preserve `.pi/`, `.pi-subagents/`, `work/`, reusable module caches, and
`build/d6-source-cache-backup.v3dj1y`. The isolated verification checkout was
moved to recoverable system trash after retaining its evidence.

Do not turn this result into claims of complete POSIX/Node/libcurl support,
Git filter support, Safari/phone/audio verification, cleanup after forced Worker
termination, or a formal containment proof. Follow [AGENTS.md](../AGENTS.md).
