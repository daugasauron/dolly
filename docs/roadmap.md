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

## Immediate stability gate — give compiler providers private state

The declarative default image and its 35-module cold browser build complete,
but the restored interactive image has a repeatable compiler-coexistence
failure. Running Clang code generation and then Zig code generation in one
runtime traps Zig in LLVM's SelectionDAG; running Zig and then Clang produces
the corresponding LLVM failure in Clang. Repeated Clang-only probes pass. A
focused browser acceptance mode now preserves this failure as a regression.

The current Zig command imports `ZigLLVM*`, `LLVM*`, and `ZigLLD*` entry points
from the same LLVM instance embedded for `/bin/cc`. Those are implementation
details, not a useful Dolly platform contract. Attempts to reset LLVM's global
command-line registry did not restore correctness and also destabilized
ordinary multi-file C builds, so this must not be papered over with a larger
public ABI or more process-global reset hooks.

Next, build Zig with a private, locally bound LLVM/LLD provider in its own side
module while continuing to import Dolly libc/filesystem operations and the
shared memory/table. This keeps files and command execution in the same WasmFS
userspace but gives each compiler its own registries, contexts, and allocator-
owned implementation state. Measure the size/startup cost before considering a
more elaborate compiler worker or file-delta protocol.

Acceptance gate: in one restored browser session, run Clang → Zig → Clang and
Zig → Clang → Zig, twice each; compile, link, and execute both C/C++ and Zig
fixtures; then run Make and Ninja builds. No compiler-private symbol may be
added to the stable Dolly machine ABI to satisfy this gate.

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
- keep each port's build and cleanup in its own pinned `.dm` module;
- make snapshot logical reproducibility measurable across clean hosts.

Acceptance gate achieved: one C-parsed graph controls source acquisition,
builds, checks, retained paths, environment, and entry; every registered image
rebuilds and restores in a real browser; recipe/source/retention changes
invalidate identity or fail. Successful modules must leave `/tmp` empty, and
failed modules have their scratch tree reclaimed before the build is discarded.

## Phase 2 — measure the platform instead of guessing it

The first static platform-census slice is implemented. It verifies a sealed
snapshot, identifies executables by ABI structure, and emits exact typed
operation-to-program and program-to-operation mappings. See
[`platform-census.md`](platform-census.md).

- Record imported Dolly/libc symbols for every linked executable. **Static
  sealed-image census implemented.**
- Record path, descriptor, clock, entropy, lifecycle, and HTTP operations by
  command epoch during acceptance workloads.
- Generate a matrix: operation × program × exercised/not exercised.
- Compare the same fixtures on Dolly and a reference POSIX system for exit
  status, stdout/stderr, filesystem changes, and network transcript.
- Keep the census entirely inside the sandbox or export it only as an explicit
  test artifact; it must not become a new runtime communication channel.

Acceptance gate: Git, Make, QuickJS/Pi, Zig, and Ghostty have repeatable
operation profiles, and every proposed ABI-v1 operation is justified by at
least two consumers or one essential agent workflow.

This is the evidence needed to design a substrate below libc without replacing
one accidental API with another speculative API.

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

The HTTP engine already performs Git protocol discovery. Finish the normal CLI
workflow without introducing sockets or host subprocesses.

- Trace `git clone` and `git fetch` through Git's remote-helper protocol.
- Prefer a small serial helper/lifecycle adapter before adding concurrency.
- Implement request-body streaming only if pack upload size proves fixed
  buffering inadequate.
- Make every redirect hop a new browser-policy authorization or continue to
  reject redirects explicitly.
- Add fixture repositories for clone, fetch, branch update, shallow clone, and
  failure/cancellation.

Acceptance gate: unmodified `git clone URL`, `git fetch`, and checkout work
through `env.dolly_http_dispatch`; no new browser import appears.

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

## Phase 5 — command epochs and hard supervision

Strengthen correctness within the shared-everything runtime.

Named compressed WasmFS sessions and build/recipe-bound restore are implemented.
This phase concerns command-local cleanup and recovery when cooperative code is
not enough; it must not turn browser persistence into a mounted filesystem.

- Attribute allocations, open descriptors, `atexit` registrations, timers,
  signal handlers, and module state to a command epoch. **Bounded ordinary
  descriptor reclamation is implemented; libc stream objects and allocations
  remain.**
- Reclaim or restore them when `wait` collects the command.
- Define exactly which state is process-like and which state is intentionally
  userspace-global.
- Add adversarial fixtures that leak descriptors/heap, change signals, call
  `exit`, crash, and then rerun a clean command.
- Keep the existing inherited `dolly_spawn_timeout` cooperative deadline and
  status-124 behavior covered by adversarial tests.
- Add a trusted outer supervisor protocol for hard CPU deadline, memory
  ceiling, output quota, cancellation, and worker replacement. **Interactive
  hard cancellation and worker replacement are implemented:** an
  unacknowledged or repeated Ctrl+C terminates even a foreign module with no
  Dolly safepoints, then reloads the last named checkpoint or sealed base image
  without exposing a guest capability. Automatic noninteractive deadlines,
  memory ceilings, and output quotas remain.

Acceptance gate: repeated hostile fixtures do not change a following clean
fixture's observable state outside intended filesystem/environment changes, and
the browser can reliably terminate and recreate a wedged session.

## Phase 6 — Dolly ABI 1 below libc

Use the census to introduce a deliberately small platform substrate.

Likely families—not yet final signatures—are:

- descriptor read/write/seek/stat/close and directory iteration;
- path open/create/remove/rename and working-directory operations;
- monotonic/realtime clocks, sleep, and entropy;
- arguments, environment, command spawn/wait/exit, and terminal control;
- the existing typed HTTP request service;
- memory/table/dynamic-module mechanics, or a replacement component model if
  browser wasm64 tooling makes it practical.

Build musl/newlib-style libc, C++, QuickJS, and at least one non-C runtime
above it. Do not delete `dolly-0` until side-by-side differential tests prove
the new target supports the useful workloads.

Acceptance gate: at least three independent runtimes share files and lifecycle
through ABI 1; the command-visible import surface is substantially smaller than
the current libc probe; the outer browser capability set does not grow.

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

Give every system image a compact fingerprint derived from its main-module
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

### Dolly-native Python wheels

Treat NumPy and Pandas as the acceptance workload for native CPython
extensions, not as special packages to unpack despite an incompatible tag.
First replace CPython's dynamic-loader stub with a Dolly loader over the
existing in-Wasm DSO machinery, retain the matching headers and sysconfig
metadata, and define a CPython SOABI and wheel platform tag that identify the
versioned Dolly wasm64 extension ABI rather than merely the CPU architecture.
Then build a minimal extension fixture, NumPy, and Pandas from pinned source in
that order. PyEmscripten/Pyodide recipes are useful evidence for upstream
WebAssembly patches, but their wasm32 binaries and ABI-sensitive Emscripten
flags are not Dolly binaries.

Acceptance gate: a browser `/rebuild/` compiles and imports a stateful C
extension, builds NumPy and Pandas into Dolly-native wheels, installs those
wheels through Bonnie, executes representative array/dataframe operations,
survives repeated imports and command epochs, and adds no browser import or
host build fallback.

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
