# Remaining audit work — handoff

Remaining work as of 2026-09-06. Completed findings have been removed; original
audit IDs are retained for traceability. Read [AGENTS.md](../AGENTS.md) first.
The broader direction remains in the [roadmap](roadmap.md).

## Starting state and guardrails

- Inspect `git status` before starting; preserve unrelated work and include
  implementation/test files when checkpointing.
- Local agent state is ignored by `.gitignore`. Do not inspect, stage, or clean
  `.pi/`, `.pi-subagents/`, or `work/`.
- The local app was left running on port 9000. Latest changes are not pushed or
  deployed; passing local tests does not describe production.
- Keep Wasm64, the kernel-owned in-memory filesystem, and the sole intentional
  agent-selected network edge, `env.dolly_http_dispatch`. Browser authority must
  remain short and human-reviewable; see [the boundary review](browser-boundary.md).
- Credentials inside Wasm and permissive development HTTP policy are deliberate
  user choices. Do not replace them with credential injection or silently tighten
  policy. The browser must still be able to enforce restrictive embedding policy.
- Prefer serial, honest adapters over fake successful APIs. No host subprocesses,
  host filesystem fallback, permission model, speculative scheduler, or broad
  rewrite is needed. Every fix needs a relevant real-browser regression.
- Saved sessions require exact runtime/recipe matching. Recent Pi-containing
  images have new recipe identities; older saves remain listed but are not
  migrated. See [sessions](sessions.md) before changing image persistence.

## Open findings

Evidence labels: **reproduced** means the original audit demonstrated the behavior
in a browser or isolated unchanged-source diagnostic; **source** means inspection
identified it without a complete end-to-end reproduction. Those original probes
were not all rerun for this handoff. Reproduce against the current tree before
changing behavior. Old measurements below are baselines, not fresh benchmarks.

### HTTP contract follow-up

The [HTTP audit checkpoint](http.md#http-audit-checkpoint-2026-09-06) records the
remaining boundary allocation limits, erased error reasons, binary-upload and
size-limit mismatches, and compatibility/budget semantics. Prioritize bounded
outer argument decoding and typed terminal errors before expanding HTTP features.
Do not replace the one broker with sockets or browser credential injection.

### Builds, publication, and maintenance must be truthful

**D1 — P1 — Full clean external bootstrap still needs verification.** The missing
prerequisites are fixed: the seed builds `llvm-nm` alongside both tblgen tools,
all three run inside their pinned build container, and README declares Python
3.14 for CPython preparation. A fresh native-tool build exposed both a relocated
CMake cache and container/host glibc incompatibility; the separate `llvm-native`
cache and container-side sysroot preparation remove those dependencies. The
native tools built from an empty build directory, the existing Wasm provider
refreshed, and sysroot/runtime/image builds passed (`build/d1-container-*.log`,
`build/d1-d6-build.log`). All 112 Wasm LLVM archives stayed byte-identical. The
Wasm object/source caches were not empty. **Acceptance still open:** run the
complete documented procedure with isolated fresh caches, preserving the working
cache, without accidentally inherited workstation tools. An unchanged seed-tool
rerun took 15.08 s and preserved all checked archives (`build/d1-unchanged-*.log`);
this is an incremental measurement, not a cold-build estimate.

**D4 — P2 — Build/publication is not a coherent atomic transaction.** Source
evidence: packaging checks existence/size without fully binding snapshot, recipe,
runtime, source commit, and acceptance results. `scripts/build.sh` deletes the served runtime
before replacement succeeds; overlapping browser and artifact-dependent tests
have failed during local rebuilds. This is not a finding that the audited public
site was stale. Stage a verified versioned artifact and publish atomically;
the unit must include browser sources, HTML/routes and recipes as well as `dist`.
check the binding in `.github/workflows/pages.yml`. **Acceptance:** interrupted builds keep
the last good app; mixed/stale/tampered artifacts fail packaging/deployment;
all five packaged routes pass before promotion.

Partial D4 checkpoint: manual deployment now requires the audited artifact's
SHA-256 and verifies it before extraction. The packager prints that digest;
the workflow's actual shell check rejects changed bytes and malformed inputs
(`build/d4-artifact-digest-tests.log`). This binds a selected archive, not its
source/test provenance, and does not make the development build atomic.

**D5 — P2/P3 — Misplaced image policy adds complexity.** Source
evidence: `src/runtime-worker.mjs` knows Slop/Pi paths, startup/restart/recovery policy;
supervisor memory-size/reclamation-delay heuristics are not release guarantees;
packaged-prefix cache matching had no useful strict-prefix pair among the five
audited images; Bonnie hardcodes NumPy-specific build choices. Move image behavior
to ordinary init/entry files, and retain heuristics
or caches only with measured benefit. **Acceptance:** image-specific behavior
does not require host edits; cache/lifecycle changes keep
measured regressions covered; package policy is explicit rather than hidden.

Seven unused standalone command files were removed, leaving the already-built
module-owned sources canonical. Six were byte-identical; the old tar copy only
added an unused feature-test define. No recipe or compiled program changed.
The duplicate-source regression fails before removal and the full build plus
181 Node tests pass afterward (`build/d5-duplicates-before.log`,
`build/d5-cleanup-build.log`, `build/d1-d4-d5-d6-node-tests.log`).

**D6 — P3 — Source provenance and remaining documentation drift.** Source evidence:
some Git fetchers check HEAD but not dirty content.
HOST hashes still check served source bytes—no digest bypass was demonstrated.
Finish reviewing historical versus current runtime/port claims, Ghostty
generation, and missing packaged documents/tools. In particular, the module-owned
`help` advertises absent `ghostty-vt`/`demo` commands in every image and Pi/JS tools
in default/Python (`build/d6-help-inventory.log`, compared with the browser-verified
image manifests). Fix that source in `modules/core-tools.dm`, not a standalone copy.
**Acceptance:**
source verification handles dirty checkouts, packaged links/help inventories
work, and docs describe measured behavior. Preserve useful completed-module
caching on failure; correct its documentation instead of removing it by accident.

Samurai and native Zig preparation keys now include their scripts; Zig's object
key also includes its builder/preparer and uses relative input names. A native
regression executes the key calculations in relocated checkouts and after code
changes (`build/d6-preparation-key-tests.log`). Actual source preparation and
native Zig rebuilding pass; the Zig object stayed byte-identical. Dollyfile docs
now distinguish failed-module scratch from retained successful layers, describe
the exact Wasm+data build ID, and stop claiming useful packaged-prefix reuse
among the current five recipes (none is a strict prefix of another).

Partial D6 checkpoint: the process archive is now rebuilt from the declared
members in deterministic order, staged, and atomically replaced only when its
bytes change. Existing incremental archives had a different member order from
fresh builds. A native regression covers stale members, unchanged timestamps,
failed publication, and staging cleanup. On this workstation an unchanged
runtime-only build fell from 65.76 s to 23.87 s by skipping the compiler relink;
archive/compiler/runtime/data hashes stayed unchanged on the second normalized
build. This is not a cold-toolchain or whole-image benchmark. All 178 Node tests,
the full Chrome suite (including Python C++), and all five rebuilt image
inventories passed (`build/d6-archive-*.log`, `build/d6-*-route.log`). The dirty-source
and remaining documentation findings above remain open.

## Suggested checkpoints and closure rules

1. Cold/prebuilt filesystems now match their declared system inventories. Before
   enabling named saves for rebuilt images, add a cross-route session-baseline
   regression. Preserve typed system/layer/session restoration coverage.
2. Verify clean bootstrap prerequisites (D1), then coherent publication (D4).
   Preserve the shared process/filesystem regressions and terminal UI service
   independent of stdin consumption.
3. Remove D5 image-policy coupling as the corresponding owner becomes clear. Keep the
   positive Zig SDK manifest and its real compiler/Ghostty regressions intact.

Fix D1 before claiming clean external-toolchain verification, and D4 before treating
the next publication as a provenance-checked release. Update D6 alongside each
affected change, not as an unrelated documentation rewrite.

An item closes only with a reproducer, the smallest in-scope fix, browser evidence,
and updated affected docs/recipes. Do not claim new NumPy/Pandas source builds,
all extended cold rebuilds, physical phone/Safari, audio, real-provider sessions,
or total resource containment from the current suite. Do not add new browser
authority to make tests pass. Preserve existing regressions.

## Evidence and restart commands

HTTP checkpoint: the queue/busy/queued-abort regression, Pi fixture streaming,
browser import/policy/deadline checks, all five prebuilt inventories and named
sessions pass on local port 9000. The runtime ABI/build ID is unchanged; the
three QuickJS-containing image recipes and snapshots were rebuilt. All 182 Node
tests pass (`build/checkpoint-http-*.log`). The rebuilt module cache is retained
at `.cache/checkpoint-http-browser-profile` (use `DOLLY_BROWSER_PORT=35149`
with that `DOLLY_BROWSER_PROFILE` to reuse its IndexedDB origin).

Firefox follow-up: native Fetch rejected the broker object as its receiver.
The bound default provider now passes real Firefox 153 OpenRouter login and
DeepSeek chat on port 9000 without a Wasm rebuild or policy change. All 183 Node
tests and the Chrome boundary regression pass (`build/firefox-http-*.log`);
the real-provider probe is `build/firefox-openrouter-live.log`. Pi's separate
`pi.dev` catalog warning is a reproduced CORS limitation, not an OpenRouter
authentication failure; see [Pi networking](pi-agent-plan.md#network-and-credentials).

Previous full-suite baseline (before the HTTP queue change): 182 Node tests and
the full Chrome suite passed, including all five prebuilt routes. Logs:
`build/d5-cleanup-build.log`, `build/overnight-harness-checked-node-tests.log`,
`build/overnight-harness-checked-full-browser.log`, and `build/d1-d6-*-route.log`.
The Python C++ extension also passed (`build/d1-d6-python-cpp-browser.log`),
as did the additional Python+Pi child/HTTP cancellation check
(`build/b7-python-pi-janis-browser.log`).
The actual app on port 9000 also passed all five image inventories, Pi streaming
and tools, libcurl, Janis children/cancellation, and the Python C++ extension
(`build/overnight-port9000-*.log`; the final boundary/libcurl logs use `checked`).
Named save/load also passed against port 9000 and the normal fixture origin
(`build/overnight-port9000-checked-session.log`, `build/overnight-checked-local-session.log`).
The test previously navigated to the fixture origin after saving on the app
origin; it now keeps session navigation on the app origin.
The harness now supplies CORS for its selected external test app and rejects
unknown modes before launching Chrome. Earlier `overnight-main-*-route`,
`overnight-main-pi`, and unchecked boundary failures were fixture-harness failures,
not evidence of a production-policy defect. Use `DOLLY_BROWSER_PAGE` with the app
root URL; the harness appends the selected image route.
Use a named mode for external-app tests: the generic full-page path still selects
the local snapshot URL while granting clipboard access to the external origin.
The ad-hoc external gamedev full-page run failed at that test permission mismatch
(`build/overnight-final-port9000-gamedev.log`); local gamedev passed.
The browser suite includes source-built process
acceptance probes, in-Wasm image/layer round trips, omitted-entry rejection,
quoted Dollyfile commands/CWD, literal ENV, sequential fetch/execute, duplicate
writer and object-kind rejection, named sessions, Pi streaming, C++ and Zig.
The C engine and JS inspector share differential fixtures; packaging and browser
admission share the ENTRY decoder. `build/d3-parser-before.log` reproduces the
original quoted-command/CWD and LIB-kind disagreement. Production boot runs no probe suite;
its executable seed contains only the bootstrap runner and compiler.
The local `build/dolly-pages-audit-2026-09-06.tar.gz` packages this checkpoint;
all five routes passed using the extracted compressed artifact
(`build/d4-packaged-*-route.log`). It has not been uploaded or deployed.

Libcurl now rejects unavailable controls at setopt, enforces protocol restrictions
before dispatch, and distinguishes NONE from Basic authentication. Browser probes
also caught and fixed reads beyond declared upload lengths, ignored zero lengths,
successful short uploads, stale POST bodies, and callback cancellation draining
the entire response. Body/header rejection now closes the actual fixture HTTP
connection early; the outer boundary still has exactly 28 imports. Before logs:
`build/b7-port9000-before-browser.log`, `build/b7-upload-before-browser.log`, and
`build/b7-callback-reproduced-browser.log`; acceptance is in the full suite and
`build/b7-cancel-after-browser.log`. The finite subset and browser-owned transport
limitations are explicit in [HTTP](http.md); this is not complete libcurl support.

Janis now uses the kernel's descriptors, environment and timestamp operations.
The fake descriptor map, Buffer slicing override, inert watches and unused
duplicate native byte-file helpers were removed. The before browser probe failed
all nine original groups (`build/b4-before-browser.log`). Both Pi images now pass
environment reflection, shared/clamped Buffer views, exclusive/numeric opens,
read/write offsets, rename/unlink survival, closed FileHandle reuse rejection,
stat/lstat/Dirent distinctions, symlink-safe removal, zero-length/DataView I/O,
real timestamps and explicit watch rejection (`build/b4-final-*-browser.log`).
This does not claim a complete Node filesystem implementation.

B3/B5 now use actual process handles: PID/parent identity, atomic spawn cwd,
nonblocking wait, explicit normal/signal exit records, and positive-PID
INT/TERM/KILL. Python overrides only upstream Popen's spawn path and retains
its pipes, communicate, wait and signal methods. Janis feeds stdin while draining
both output pipes, supports paused output, kills on abort/deadline, and reports
unsupported facilities through spawn errors without creating a child. Pi's
extension connects both shell entry points to those handles. HTTP polling is
nonblocking; aborted requests and cancelled readers close real browser-side
fixture connections. No outer browser import was added.

Before probes: `build/b3-janis-before-browser.log` and
`build/b5-before-browser.log`. Browser acceptance is in
`build/b3-janis-oauth-browser.log`,
`build/b3-janis-python-pi-oauth-browser.log`, and
`build/b5-{python,python-pi}-final-browser.log`. The regression suite also caught
real-PID/libc fallback-TID disagreement deadlocking nested stdio, a Pi shell
completion/input race, and synchronous rejection breaking Pi's manual OAuth
fallback. All three have regressions; intermediate failures remain in
`build/b5-stdio-before-browser.log`, `build/b3-pi-first-browser.log`, and
`build/b3-b5-final-full-browser.log`. General signal handlers, process groups,
extra inherited descriptors and complete Node stream/thread compatibility remain
unsupported. These tests do not prove a new NumPy/Pandas build or Git clone.

The C++ SDK now uses the genuine process archives for implicit and explicit
links, including `cc -lc++` and `-Wl,` forms. Browser regressions exercise
containers, exceptions/destructors, RTTI, one shared DSO runtime, a Python C++
extension, freestanding kernel-plugin compilation, and generic static-library
link order. The substitutes and obsolete duplicate `src/startup.mk` were removed.
`build/b8-before-browser.log` reproduces the original duplicate-symbol link;
`build/b8-link-order-before.log` caught and preserves an intermediate regression.
The suite also found a last-timer/HTTP-completion event-loop bug: queued promise
jobs were mistaken for no remaining work. The runner now drains them while still
rejecting genuinely stranded top-level promises (`build/janis-last-job-{before,after}.log`).
The subsequent B3 checkpoint above connects child/abort operations to real handles.

Busy-terminal selection/copy now runs in the kernel presentation tick, with
ordered compaction in the existing bounded input ring and no new browser import.
The browser probe preserves queued keys/text, paste, partially encoded input,
and pending terminal-query replies during eight-second sleeps. It also checks
sustained UI traffic and exclusive graphics-event ownership; a native test
exercises all queue sizes, counter wrap and producer publication during service.
Both Pi images pass the longer child-output/copy check, including Pi while a
build was running (`build/b9-{pi,python-pi}-browser.log`). The full gamedev suite
also passes game release/forced cancellation and post-game shell responsiveness.
Before evidence: `build/b9-before-browser.log`; an intermediate ring-exhaustion
bug was caught by `build/b9-ring-pressure-reproduced.log` before compaction.

The development server's encoded documentation traversal also has a real HTTP
regression: `/docs/..%2fAGENTS.md` returned 200 before the resolved-root check and
now returns 404. Both development servers are fixed; the native HTTP test,
browser boundary gate, all 176 tests, and all five routes passed
(`build/server-path-*.log`).

All five images' prebuilt and fresh-profile rebuild inventories match the
packaged manifest exactly, with no extra system/PATH files
(`build/c3-*-inventory.log`). The before probe found 394 undeclared system paths
(`build/c3-before.log`). The compiler SDK is now explicitly retained. The
supported-target Zig install manifest then removed 148,156,314 bytes from every
image; Python+Pi was 381,700,495 bytes at that checkpoint, below the unchanged 512 MiB limit.
`build/c4-{before,after}-inventory.log` records all five images' sizes and file
counts. Default prebuilt kernel memory fell from 971,046,912 to 763,625,472 bytes
(`build/c4-{before,after}-browser.log`); both passed Zig math/u128/container
compile-link-run and test-object compilation. The fresh-profile cold default
inventory also passed (`build/c4-default-cold-inventory.log`), including Ghostty's
full source build. The 10 MB compiler-rt test stays: ordinary compilation reads it.

Default userspace reproducibility passed two independent cold browser builds
and one cached build, with isolated owned profiles/outputs and no packaged-image
inputs, including after normalization (`build/c3-reproducibility.log`). The old checker demonstrably skipped both
builds (`build/d2-before.log`). This is not clean external-toolchain evidence or
a claim that every extended image has independently passed the same comparison.

Remaining-finding evidence includes `build/audit-2026-09-05.md` and
`build/utf8-node-tests-during-build.log` (D4). These ignored local artifacts are
not release attestations; the finding descriptions above must stand on their own.

```sh
node --test test/*.test.mjs
DOLLY_IMAGE=default DOLLY_BROWSER_MODE=slop ./scripts/test-browser.sh
DOLLY_IMAGE=pi DOLLY_BROWSER_MODE=utf8 ./scripts/test-browser.sh
DOLLY_IMAGE=python-pi DOLLY_BROWSER_MODE=pi ./scripts/test-browser.sh
DOLLY_BROWSER_MODE=process-abi ./scripts/test-browser.sh
DOLLY_IMAGE=python-pi DOLLY_BROWSER_MODE=python-interactive ./scripts/test-browser.sh
./scripts/test-browser.sh
```

These commands use existing build artifacts. `npm run build:runtime` regenerates
them but currently replaces the served files in place (D4). New checkouts also
need the documented toolchain/bootstrap inputs, with D1 still outstanding.

Retain a relevant regression in the repository when fixing each finding.
Test code owns and cleans its temporary state.
