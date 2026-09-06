# Dolly roadmap

This roadmap starts from the working August 2026 proof: one browser-contained
wasm64 userspace can compile and run conventional tools, render its own
terminal, and execute upstream Pi through one explicit network edge. The next
work should make that result smaller, more reproducible, and easier to extend—not
merely add more packages.

## North-star tests

Every milestone should improve at least one of these measurements:

1. **Capability size:** exact browser imports, especially agent-selected
   communication edges.
2. **Platform size:** operations below libc required by multiple real runtimes.
3. **Compatibility honesty:** APIs whose semantics are tested, simplified and
   documented, or explicitly unsupported.
4. **Reproducibility:** pinned source plus one recipe produces a verifiable
   capsule.
5. **Agent usefulness:** a real Pi task can inspect, edit, build, test, and use
   source control entirely inside the sandbox.
6. **Reset quality:** one command or session cannot accidentally poison the
   next except through intended files and environment.

Raw package count, POSIX checklist coverage, and native performance are not
north-star metrics.

## Immediate stability gate — private process model validated

The shared-address-space experiment exposed the same failure Linux avoids with
`execve`: repeated Clang, LLD, Zig, CPython extension, and dynamic-loader jobs
retained allocator, TLS, registry, and table state that no reliable cleanup hook
could reconstruct. Dolly now gives every ordinary executable a fresh Worker,
private wasm64 memory, table, libc, allocator, and runtime. The kernel alone
owns filesystem bytes, descriptors, cwd/environment, process records, terminal,
and the HTTP device.

`dolly-process-0` is the closed executable contract. It imports one private
memory and one typed packet-call gate and exports `_start`; it cannot import
browser or kernel-libc functions. A trusted multi-memory Wasm gate copies
bounded pointer-free packets between process and kernel memory. Clang, LLD, and
Zig are one private compiler executable rather than resident kernel code.
Ghostty's persistent display driver is the sole explicit kernel plugin.

Ctrl-C records SIGINT for the foreground process tree, wakes deferred calls,
maps an unacknowledged signal to status 130, and forcibly terminates an
uncooperative Worker after a short grace period. Timed spawns also have a
trusted supervisor timer, so a pure CPU loop exits 124 without relying on
compiler safepoints.

The acceptance gate now passes in Chromium: fresh images compile and restore;
clean processes run mixed Zig and Clang sequences and repeated optimized Clang
jobs; C, C++, Make, Ninja, process-local DSOs, CPU-loop timeout, Ctrl-C, descriptor
inheritance, pipelines, framebuffer restoration, and post-failure execution
are permanent browser regressions. Fresh NumPy/Pandas source builds and
array/groupby checks now pass too; see the Python track below.
This added no compiler-private browser import or host-build fallback.

## Phase 1 — make builds declarative (complete)

The authoritative [Dollyfile](dollyfile.md) executor is now `/bin/dollyfile`, a
C program compiled inside the sandbox. It executes image recipes, pinned `.dm`
modules, and every `SOURCE`, inline `FILE`, `SLOP`, and `EXPORTS` declaration
strictly in order. Each browser input is named and SHA-256 pinned; deterministic
source archives remain useful for complete upstream trees, but they are inputs
to a module rather than implicit filesystem state. JavaScript performs only the
matching fail-fast lint and plain-text rendering. Default, Pi, Python-Pi, and
gamedev rebuild/prebuilt routes, recipe viewers, human-readable recipe locks,
exact retained manifests, and recipe-bound snapshots are generated and
browser-tested.

Useful follow-up work remains, but it is refinement rather than split
authority:

- replace large deterministic source archives with a content-addressed cache
  without weakening row-by-row completion;
- record output digests for important build products in the image lock;
- extend independent cold-build reproducibility checks to every image; Python
  now matches across two cold builds and one cached build after disabling
  build-time bytecode caches, alongside the existing default-image proof;
- keep each port's build and cleanup in its own pinned `.dm` module;
- make snapshot logical reproducibility measurable across clean hosts.

Acceptance gate achieved: one C-parsed graph controls source acquisition,
builds, checks, retained paths, environment, and entry; every registered image
rebuilds and restores in a real browser; recipe/source/retention changes
invalidate identity or fail. Successful modules must leave `/tmp` empty, and
failed modules have their scratch tree reclaimed before the build is discarded.

## Phase 2 — refine the platform contract

The static process census verifies a sealed snapshot, validates executables
against the current process ABI, and maps their exact callable imports. The
packet-call gate multiplexes platform operations, so imports alone cannot
identify which operations each program uses. See
[`platform-census.md`](platform-census.md).

API shape is a user-led design decision. An operation census is not a planned
audit task or a prerequisite for ABI changes. Continue testing exact imports,
documented semantics and real program compatibility without adding profiling
infrastructure.

## Phase 3 — harden the completed Pi source loop

Pi is now a target-side source build rather than a host-generated compatibility
bundle. Keep that path small and broaden its evidence.

1. Run a pinned TypeScript compiler under Janis. **Implemented with the
   unchanged official TypeScript 5.9.3 compiler.**
2. Compile single-file and multi-file ESM fixtures into WasmFS. **Implemented
   and executed in the browser rebuild.**
3. Compile pinned Pi TypeScript sources inside Dolly. **Implemented for all 495
   modules across seven runtime workspace packages with `noCheck`; the
   unbundled graph is published under the conventional global `node_modules`
   root and is the module graph loaded by `/usr/bin/pi`.**
   **Janis resolves its ESM, CommonJS, JSON, package imports/exports,
   `import.meta.resolve`, and builtin adapters entirely through WasmFS.**
4. Make Janis's used Node surface executable-test-driven. Bind real zlib from
   `/usr/lib/libz.a` if Pi or useful extensions demonstrate the need.
5. Remove host esbuild from the Pi implementation path. **Implemented. The
   external profile is source-visible and each package is checked against
   `package-lock.json` before deterministic archival.**
6. Exercise TypeScript extensions installed, compiled, loaded, and restarted
   inside one Dolly session. **Implemented in the deterministic Chrome Pi
   proof: `/usr/bin/tsc` emits the extension into Pi's WasmFS extension
   directory, a fresh Pi loads it, and the fixture model invokes its tool.**

Acceptance gate: a clean `/rebuild` starts from pinned TypeScript sources,
produces `/usr/bin/pi` and its runtime files inside Dolly, and the TUI,
tool-call, credential-egress-policy, extension, restart, and real-provider
tests remain green. **This gate is implemented for the current OpenRouter
profile.** The Pi census now reports every external package's exact lock
integrity, declared license and retained root license files, lifecycle/native
risk flags, and a conservative non-runtime-file inventory. It does not prune
files from that inventory without reachability evidence. Next, exercise more
providers and extensions and convert every newly observed incompatibility into
a finite Janis regression. Full TypeScript type checking remains a separate
source-graph requirement and is not implied by successful emit.

## Phase 4 — complete ordinary Git transport

**Implemented:** existing mapped spawn launches Git helpers, while sideband
receive uses an immediately unlinked in-Wasm spool before indexing. Browser
fixtures prove HTTP v0/v2 clone/fetch, checkout/branch updates, shallow/deepen,
pack corruption and transfer cancellation through `env.dolly_http_dispatch`.
No browser import was added. Remotes must permit browser Fetch/CORS; redirect
and credential policy remains at the same browser boundary.

HTTP push also uses serial sideband spooling; browser tests check remote refs,
contents, rejection and interrupted-transfer recovery. Configured clean/smudge
filters still need an upstream callback port. See [port status](port-status.md#git-filters).

### Nested guest Wasm experiment

Pi's Photon dependency establishes a concrete use case for wasm32 modules
loaded by JavaScript inside Dolly's wasm64 userspace. The current profile
disables auto-resize and excludes Photon because QuickJS-ng has no
`WebAssembly` global; keeping an unusable binary payload is not compatibility.

- First compare a small in-Wasm interpreter with recompiling the required
  image operation directly for Dolly; neither may introduce a browser import.
- Keep module bytes and filesystem access inside WasmFS.
- Bound memory, execution, and cancellation through Dolly's lifecycle model.
- Restore Photon only after a real Pi image-read fixture proves pass-through,
  resize, malformed-input failure, and Ctrl-C recovery.

Acceptance gate: image resizing works without adding a browser import or host
filesystem edge, and hostile nested code remains inside the same authority
fingerprint.

## Phase 5 — process supervision (implemented; hardening continues)

Private process instances replace command epochs. Exiting or terminated
processes discard their allocator, libc streams, `atexit` registrations,
dynamic modules, TLS, tables, and runtime globals as one unit. Kernel-owned
descriptors and process records are reclaimed explicitly. Named compressed
WasmFS sessions remain persistence, not a mounted browser filesystem.

Implemented supervision includes PID/parent records, spawn/wait, inherited
descriptors and environment, pipes, pending SIGINT, deferred-call wakeup,
status 130 forced cancellation, and status 124 hard deadlines. Remaining
hardening is evidence-driven: add adversarial leak/crash/CPU-loop fixtures,
bound per-process memory, and add an output quota only when the terminal and
pipe semantics are clear.

Acceptance gate: repeated hostile fixtures cannot change a following clean
process outside intended filesystem/environment changes, and the browser can
always terminate a wedged process without discarding the kernel filesystem.

## Phase 6 — stabilize Dolly ABI 1 below libc

ABI 0 now proves a deliberately small platform substrate with these families:

- descriptor read/write/seek/stat/close and directory iteration;
- path open/create/remove/rename and working-directory operations;
- monotonic/realtime clocks, sleep, and entropy;
- arguments, environment, command spawn/wait/exit, and terminal control;
- the existing typed HTTP request service;
- process-local dynamic-module and foreign-call mechanics.

The Emscripten-musl-derived process sysroot, libc++, QuickJS, CPython, Zig,
Clang/LLD, and ordinary C/C++ tools already run above it. Use the census and
browser regressions to remove accidental operations, freeze exact semantics,
and version the result as ABI 1. Keep the process ABI distinct from the narrow
resident display-plugin contract and the outer browser device imports.

Acceptance gate: at least three independent runtimes share files and lifecycle
through ABI 1; every operation has a real workload and conformance fixture; the
outer browser capability set does not grow.

## Phase 7 — capsules and distribution

Turn the static snapshot into a first-class content-addressed artifact.

A `.dolly` capsule could contain:

- the opaque filesystem snapshot;
- Dolly ABI and runtime build digests;
- Dollyfile and source lock digests;
- retained-path manifest and entry point;
- declared—not granted—network requirements;
- acceptance-check results and provenance attestations.

The capsule encoding may deduplicate identical file payloads as a transport
optimization, but restore must materialize independent WasmFS files. This keeps
ordinary mutation semantics: changing `/usr/bin/python3`, for example, must not
silently change `/usr/bin/python`. A September 2026 census found 5,967,318 bytes
of repeated payload among default-image files of at least 64 KiB and 17,710,047
bytes in the Python image. That is a bounded v2-format opportunity, not a reason
to introduce hard-link behavior or shared mutable file backing into userspace.

The browser should verify the capsule before restore. Network policy and secrets
remain embedding configuration and are never embedded in the capsule.

Acceptance gate: two clean builds from the same locked inputs produce identical
logical manifests and restore behavior; a changed recipe, ABI, or source is
visible in the capsule identity.

## Experimental tracks worth exploring

These are high-value experiments, not commitments.

### Capability fingerprints

Give every system image a compact fingerprint derived from its kernel-module
browser imports, command ABI digest, declared HTTP requirements, and retained
files. A code review can then answer “did this build gain authority?” without
reading a megabyte-scale generated loader diff.

Implemented for sealed images: [`capability-fingerprint.md`](capability-fingerprint.md)
defines separate authority and full-capsule digests. Browser policy grants stay
outside the reusable image, so the authority digest records the sole network
edge rather than a deployment's secrets or destination rules.

### Deterministic HTTP record/replay

Allow the trusted test harness to record bounded request/response transcripts
after policy evaluation, then replay them without network access. This would
make agent integration tests deterministic and turn unexpected egress into an
obvious transcript diff. Replay is test infrastructure, not a guest API.

### Forkable workspaces

Snapshots make cheap branchable sessions plausible: start from one verified
capsule, fork an in-memory workspace before a risky agent step, compare results,
and discard losing branches. This is more interesting for agents than Unix
process fidelity and fits the disposable-whole-sandbox model.

### Compatibility laboratory

Maintain a corpus of small upstream build recipes and agent tasks. Run each on
Dolly and a Linux reference, then publish the semantic delta. The result would
be a concrete “agent POSIX” specification derived from use rather than a vague
claim of Linux compatibility.

### Dolly-native Python wheels (implemented; stabilization continues)

NumPy and Pandas are the acceptance workload for native CPython extensions,
not special packages unpacked despite an incompatible tag. CPython now loads
Dolly process-local DSOs, retains matching headers and sysconfig metadata, and
uses a Dolly wasm64 extension identity. Upstream libffi is source-built for
`_ctypes`; minimal C/C++ extension fixtures build from source inside the browser.
PyEmscripten/Pyodide binaries are not used.

The packaged Python-image gate starts without NumPy, Pandas, or Meson and
requires complete source builds, array/dataframe computations, denied raw
sockets and temporary-state cleanup. This gate now passes with NumPy 2.5.2,
Pandas 3.0.5 and Meson 1.12.0 after implementing real descriptor inheritance and
close-on-exec semantics. Separate C/Python fixtures cover `close_fds`, `pass_fds`,
stdio mappings and failed-launch cleanup. Broader extension-module coverage and
a frozen public SOABI/wheel policy remain follow-up work.

### Egress receipts

The browser broker can produce a trusted per-session summary of destinations,
methods, byte counts, permitted credential-header names, denials, and side-effect
classes. Bind that receipt to the capsule and policy digests. This makes Dolly
useful for auditing autonomous agents without exposing secrets or response data.

### A tiny in-sandbox package store

Instead of recreating npm, define a content-addressed store for source-only,
dependency-locked agent extensions. Installation becomes: fetch through policy,
verify digest, compile if necessary, and atomically expose one directory. No
lifecycle scripts, native addons, or ambient executable hooks are needed.

## Explicit non-goals until evidence changes

- multiprocessing and job-control fidelity;
- permission and user models inside a single disposable sandbox;
- raw socket compatibility;
- complete Node, npm, or Linux emulation;
- performance optimization before correctness profiles exist;
- importing broad DOM, Canvas, WebGL, or host-shell APIs.

The best next Dolly is not the one with the most Unix features. It is the one
where a useful agent can do more while the platform and browser authority become
more explicit.
