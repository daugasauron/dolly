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
- Bonnie reads image-owned PEP 517 settings from `/etc/bonnie/build.toml` and
  invokes pip's CLI in a fresh Dolly Python process, not its private in-process
  API. This fixes pip logging recreating deleted build directories. Both Python
  images pass repeated real-backend builds, injected publication failure,
  preservation of the previous wheel, cleanup and unchanged caller environment.
  Obsolete reused-interpreter `sys.path` repair is removed. The scientific-package
  gate is separate and currently fails, as detailed below.
- Slop recognizes `!` at command boundaries, including after `then`/`else`/`do`
  and inside groups. All 54 shell fixtures pass native sanitizer/reference and
  Chromium checks, including Make failure propagation. Image-owned help only
  advertises actual tools; all five live inventory/help checks pass.
- Documentation packaging resolves the real 27-file local-link graph through
  an explicit public-source allowlist. Staged browser acceptance and real
  negative publication checks pass. Pi's source cache now uses the shared dirty-
  tree verifier, not just HEAD; builds diagnose missing `npm ci` early.

All five images use runtime
`sha256:b2122d327e555930fd0e3f1684d2ef476c34a1711efffb6dc4ae1bb0cb6cbec5`.
**202 source tests and the complete Chrome suite pass**, including boundary,
process ABI/DSOs, HTTP, signals, UTF-8, Pi/Janis, sessions, C++ and Zig. All five
staged publication inventories pass. A final committed-source publication should
use these tested runtime/images; inspect its log and source provenance.

Useful evidence:

- `build/d5-d6-all-node-final.log`, `build/d5-d6-full-chrome.log`,
  `build/d5-bonnie-subprocess-snapshots.log`, `build/d6-help-*-current.log`.
- `build/d5-bonnie-subprocess-browser.log`,
  `build/d5-bonnie-subprocess-python-pi.log`,
  `build/d6-documentation-publication.log`, `build/d6-publication-negative.log`.
- `build/d5-bonnie-subprocess-pandas.log`: **failed**, details below.
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

### Correct descriptor inheritance, then rerun NumPy/Pandas

The fresh package gate reached NumPy 2.5.2/Meson 1.11.1 and failed before
`cc --version`: Meson passes `close_fds=False`, explicitly rejected by
`src/runtimes/cpython-subprocess.py`. This is not a compiler hang or network
failure. Current README/port-status/roadmap claims now reflect that limitation.

The underlying gap is generic: `src/process/libc-adapter.c` fakes
`F_GETFD`/`F_SETFD`/`FIOCLEX`, ignores close-on-exec on dup/pipe creation, and
`src/process-kernel.c:configure_descriptors` only maps stdio. Do not simply drop
Python's rejection or patch Meson. Implement kernel-owned descriptor flags and
correct inheritance through the typed spawn contract, distinct from shared
open-file status flags. Cover pipes, dup/dup2/dup3/F_DUPFD_CLOEXEC, invalid
handles, `close_fds` and `pass_fds` with finite C/Python browser fixtures.
Explicit stdio redirection must clear CLOEXEC; inheriting stdio is different.

Acceptance: unchanged Meson detects compilers; a clean `bonnie install pandas`
builds its graph; fresh Python processes run array/groupby checks; raw sockets
remain denied and completed/failed builds own their temporary state.

### D1 — Finish one uninterrupted fresh-cache bootstrap

Four cache-hidden prerequisites were fixed: LLVM sparse `libc`, Bison stdout
contamination, wasm64 PIC compiler builtins and Clang resource headers.
The prior isolated run resumed after those fixes, used only its own generated
caches, produced the working runtime ID and all five images, and passed the
full suite (`build/d1-clean-bootstrap-headers.log`).

The final-run harness omitted README's `npm ci` and failed while preparing Pi;
this was a harness error, not a new bootstrap prerequisite. Its checkout was
moved to system trash. The replacement complete procedure **finished with status
1**, exec session **36689**, log
`build/d1-complete-procedure.log`: `npm ci`, external toolchain, then `npm test`,
with empty caches and an explicit host tool PATH. Its toolchain, runtime, five
images and 192 source tests passed; the browser suite then reproduced the Slop
negation failure after `else`. That frozen source predates the fix, which now
passes native and browser regressions in the main tree. This is not a complete
green fresh-cache gate. The 8.6 GiB owned checkout was moved to system trash,
recoverably. No clean bootstrap is currently running. Keep the log; finish one
full clean run on final sources, after the remaining source changes.

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

Acceptance: customizing an image needs no browser-worker path edits; package
choices are explicit; cancellation and process/file sharing still pass.

### Complete ordinary Git transport

Exercise fixture-backed `git clone`, `fetch`, checkout, branch updates, shallow
clone, errors and cancellation. Protocol discovery already works; helper pipes
and lifecycle still need end-to-end proof. Prefer a small serial implementation,
without sockets or host subprocesses. Keep redirect denial explicit unless
every hop is separately authorized by browser policy.

Read-only audit found the concrete gaps: upstream `run-command.c:start_command`
still forks; `fetch-pack.c:get_pack` also forks via `start_async` for sideband
demultiplexing, including protocol v2. Use the existing Dolly spawn/env/cwd API
for the former and an owned unlinked seekable pack spool for the latter; do not
run arbitrary async callbacks synchronously against bounded pipes. Git also
still selects `NO_POLL`/`compat/poll` despite Dolly's real pipe-poll support.
Start with fixture-backed `ls-remote`, then clone/fetch using a pack larger than
64 KiB, native-Git-validated fixture data, and real transfer cancellation.

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
