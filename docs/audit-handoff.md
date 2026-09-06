# Audit checkpoint

Closed 2026-09-06. Functional source: `91a7fa2`. No remaining implementation
items from this audit. Broader work belongs in the [roadmap](roadmap.md);
API scope is the user's design choice, not an operation-profiling exercise.

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
Git push/filter support, Safari/phone/audio verification, general signal-handler
cleanup, or a formal containment proof. Follow [AGENTS.md](../AGENTS.md).
