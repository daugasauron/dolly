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

## Phase 1 — make builds declarative

Implement the first [Dollyfile](dollyfile.md) compiler.

- Parse a small line-oriented recipe with `SOURCE`, `COPY`, `ENV`, `WORKDIR`,
  `RUN`, `KEEP`, `CHECK`, and `ENTRY`.
- Produce the preload/source plan, `/etc/dolly/startup.slop`, the retained-file
  snapshot manifest, and build checks from one source of truth.
- Keep v0 build steps offline. Remote inputs are acquired by the trusted build
  tool only when URL, version, and SHA-256 are present; compilation still runs
  inside Dolly.
- Emit a human-readable lock file containing resolved source digests, recipe
  digest, Dolly ABI digest, and expected output paths. It need not be JSON.
- Convert the current handwritten startup graph without changing the resulting
  system image.

Acceptance gate: the generated recipe and the current handwritten graph produce
the same retained paths, both boot through the browser proof, and removing a
required `KEEP` entry causes a clear `CHECK` failure.

Why first: it removes the current three-way duplication between CMake preload
flags, `startup.slop`/`startup.mk`, and `system_files[]`. It also gives every new
port a clean, reviewable home.

## Phase 2 — measure the platform instead of guessing it

Add a compile-time/runtime “platform census” mode.

- Record imported Dolly/libc symbols for every linked executable.
- Record path, descriptor, clock, entropy, lifecycle, and HTTP operations by
  command epoch during acceptance workloads.
- Generate a matrix: operation × program × exercised/not exercised.
- Compare the same fixtures on Dolly and a reference POSIX system for exit
  status, stdout/stderr, filesystem changes, and network transcript.
- Keep the census entirely inside the sandbox or export it only as an explicit
  test artifact; it must not become a new runtime communication channel.

Acceptance gate: Lua, Git, Make, QuickJS/Pi, Zig, and Ghostty have repeatable
operation profiles, and every proposed ABI-v1 operation is justified by at
least two consumers or one essential agent workflow.

This is the evidence needed to design a substrate below libc without replacing
one accidental API with another speculative API.

## Phase 3 — finish the Pi source loop

Make Pi a target-side source build rather than a host-generated compatibility
bundle.

1. Run a pinned TypeScript compiler under Janis.
2. Compile single-file and multi-file ESM fixtures into WasmFS.
3. Compile pinned Pi TypeScript sources inside Dolly.
4. Make Janis's used Node surface executable-test-driven. Bind real zlib from
   `/usr/lib/libz.a` if Pi or useful extensions demonstrate the need.
5. Remove host esbuild from the Pi implementation path, retaining it only if it
   remains useful as an independent build-time verifier.
6. Exercise dependency-free TypeScript extensions installed, compiled, loaded,
   and restarted inside one Dolly session.

Acceptance gate: a clean `/rebuild` starts from pinned TypeScript sources,
produces `/usr/bin/pi` and its runtime files inside Dolly, and the existing TUI,
tool-call, credential-egress-policy, extension, and restart tests remain green.

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

## Phase 5 — command epochs and disposable sessions

Strengthen correctness within the shared-everything runtime.

- Attribute allocations, open descriptors, `atexit` registrations, timers,
  signal handlers, and module state to a command epoch.
- Reclaim or restore them when `wait` collects the command.
- Define exactly which state is process-like and which state is intentionally
  userspace-global.
- Add adversarial fixtures that leak descriptors/heap, change signals, call
  `exit`, crash, and then rerun a clean command.
- Add a trusted supervisor protocol for CPU deadline, memory ceiling, output
  quota, cancellation, and worker replacement. The protocol should control the
  worker from outside without exposing a new guest capability.

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

Build musl/newlib-style libc, C++, Lua, QuickJS, and at least one non-C runtime
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
