# Remaining audit work

Read [AGENTS.md](../AGENTS.md) first. Broader direction:
[roadmap](roadmap.md). Updated 2026-09-06.

## Guardrails

- Inspect Git state and preserve unrelated changes. Do not inspect, stage or
  clean `.pi/`, `.pi-subagents/` or `work/`.
- Keep wasm64, kernel-owned mutable state, private command instances and exactly
  one intentional agent-selected network edge: `env.dolly_http_dispatch`.
- Browser authority must remain short and human-reviewable; maintain
  [the review map](browser-boundary.md). Credentials inside Wasm and permissive
  development HTTP policy are intentional choices. Restrictive embedding policy
  must remain enforceable after total Wasm compromise.
- No host filesystem/subprocess fallback, permission model, speculative scheduler
  or broad runtime rewrite. Use upstream programs and finite browser regressions.
- Do not remove useful completed-module caching; failed module scratch and
  successful reusable layers are different things.
- Local evidence is not production evidence. Nothing in this checkpoint has
  been pushed or deployed. Saved sessions need exact runtime/recipe matches;
  incompatible saves remain listed, without an invented migration.

## Current checkpoint

The app on port **9000** now serves only a published whole-app release.
`npm run publish` verifies and browser-tests staged output, creates the Pages
archive, and atomically switches `build/releases/current`. `npm run serve`
does not serve mutable source/`dist`. HTML pins asset URLs to its release;
public session links remain `/session/NAME`. Old releases remain available for
open tabs. Source changes need a new publication to appear locally.

Implemented and verified:

- Binary JS HTTP bodies preserve byte views and queue-time ownership; the
  unused synchronous HTTP collector is removed. Exact 1 MiB process packet
  limits, typed errors, cancellation and deadlines pass Chrome and Firefox 153.
  The outer runtime still imports exactly 28 capabilities.
- All five images support rebuild-to-named-session save/load, with complete
  base-digest comparison before the first save. Changed bases cannot create
  incompatible saved records.
- Python's bytecode timestamp nondeterminism is fixed at its source: export
  `PYTHONDONTWRITEBYTECODE=1` before Make runs Python. Two independent cold
  builds and one cached build are byte-identical. Python and Python-Pi each
  lost 567588 bytes of unwanted caches. This is not an independent two-cold-build
  Python-Pi proof.
- Git source caches reject tracked, staged, untracked and ignored changes.
  LLVM allows precisely its declared patch, using a private index that preserves
  the real checkout/index.
- Whole-app release verification binds runtime bytes, process ABI, registry,
  HOST sources, retained recipes/environment/ENTRY, snapshot manifests and
  acceptance to exact files. The deployment workflow also verifies the selected
  source commit and source hashes; dirty local artifacts cannot masquerade as
  committed releases.
- The static census now validates `dolly.process` executables rather than the
  obsolete `dolly_main` interface. Counts: default 91, Pi 95, Python 94,
  gamedev 96, Python-Pi 98. All share one callable packet gate. These are
  machine-import counts, **not platform-operation usage**.

All five images use runtime
`sha256:98c986008f5e03464c5f4d8923d8ffe38288e1037ab7e73561e254fabbefed13`.
Current source tests: **192 pass**. The previous isolated full bootstrap
continuation passed all 188 then-existing tests and the complete Chrome suite.
The publication checkpoint separately passes all five packaged and pinned-server
inventories, named sessions, Pi streaming/tools, and port-9000 Janis HTTP/children.

Useful evidence:

- `build/http-bytes-*.log`, `build/python-reproducibility-fixed.log`,
  `build/session-baseline-*-guarded.log`.
- `build/d4-checkpoint-node-tests.log`, `build/d4-verified-publication.log`,
  `build/d4-pinned-*-browser.log`, `build/d4-port9000-http-browser.log`.
- `build/d4-real-release-negative.log`: real mixed runtime/image/digest,
  unbound acceptance and changed-browser rejection; current release preserved.
- `build/d4-source-provenance.log` and `build/d4-source-mismatch.log`:
  matching source accepted, subsequent source edits rejected.
- Permanent publication checks: `test/site-release.test.mjs` and
  `node scripts/test-site-release.mjs` (requires a published release).

## Remaining work, in order

### D1 — Finish one uninterrupted fresh-cache bootstrap

Four cache-hidden prerequisites were fixed: LLVM sparse `libc`, Bison stdout
contamination, wasm64 PIC compiler builtins and Clang resource headers.
The prior isolated run resumed after those fixes, used only its own generated
caches, produced the working runtime ID and all five images, and passed the
full suite (`build/d1-clean-bootstrap-headers.log`).

The **final uninterrupted run is active**, exec session **38257**, checkout
`/tmp/dolly-bootstrap-final.YEYjpv`, log
`build/d1-uninterrupted-final.log`. It starts with empty caches and an explicit
host tool PATH. Poll that handle before doing anything else; a quiet log is not
a stopped process. It captured the publication source before the later
host-only census/test additions.

Acceptance: documented external toolchain → runtime → five images → complete
tests, with no copied workstation caches. Clean the owned checkout after
closure. The earlier 8.6 GiB checkout and obsolete diagnostic snapshot were
moved to system trash, recoverably. Source-cache debris was previously moved
to `build/d6-source-cache-backup.v3dj1y`; do not silently delete it.

### D5 — Put image policy inside the image

`src/runtime-worker.mjs:runImageEntry` still knows Slop/Pi paths, startup,
Pi retry and recovery policy. Move those decisions into ordinary image-owned
entry/init files. Preserve startup output, shell recovery, Ctrl-C and game
cancellation. Account for the supervisor's foreground-root/interactive semantics;
wrapping everything in a child shell must not make an idle shell permanently
interruptible or kill the recovery shell on every Ctrl-C. Do not fake `exec`.

Bonnie's `_source_build_setup_arguments` hardcodes NumPy Meson options. Put that
package policy in a source-visible image configuration file and have Bonnie
interpret it generically. Retain serial builds and transaction-owned temporary
files. Keep performance heuristics only with measured benefit.

Acceptance: customizing an image needs no browser-worker path edits; package
choices are explicit; cancellation and process/file sharing still pass.

### D6 — Make help and remaining documentation truthful

The canonical `help` source in `modules/core-tools.dm` advertises missing
`ghostty-vt`/`demo` commands and Pi/JS tools even in default/Python.
Fix the module-owned source, not a duplicate standalone command.
Check packaged documentation links and remaining historical runtime/port
claims alongside the changes. Dirty-source verification itself is complete.

### Complete ordinary Git transport

Exercise fixture-backed `git clone`, `fetch`, checkout, branch updates, shallow
clone, errors and cancellation. Protocol discovery already works; helper pipes
and lifecycle still need end-to-end proof. Prefer a small serial implementation,
without sockets or host subprocesses. Keep redirect denial explicit unless
every hop is separately authorized by browser policy.

### Measure real platform operations

Static imports cannot measure operations multiplexed through the packet gate.
Count operations per invocation inside Wasm, exercise real Git/Make/Pi/compiler
workloads, and export only explicit test artifacts. Include attempted operations
and failures, not just successful calls. Compare relevant stdout/stderr/status,
filesystem and network behavior with reference POSIX fixtures.
Use measured consumers to justify ABI 1; do not freeze a speculative API.

## Closure rules

The goal includes **all remaining sections**, not only HTTP or publication.
An item closes with a minimal implementation, relevant real-browser evidence and
updated affected docs/recipes. Do not claim fresh NumPy/Pandas source builds,
all extended cold reproducibility checks, physical Safari/phone/audio tests or
real-provider sessions from unrelated green fixtures. Do not push/deploy merely
because local publication passed.
