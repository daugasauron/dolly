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

## Earlier published checkpoint (`a4dffeb`)

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
  gate originally failed; the validated descriptor checkpoint below fixes it.
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
staged publication inventories pass. That committed-source release is `a4dffeb`;
`build/d6-checkpoint-publication.log` and
`build/d6-committed-source-verification.log` verify its source provenance.

## Validated descriptor checkpoint

Kernel-owned close-on-exec flags and generic spawn mappings are implemented,
including Python `close_fds`/`pass_fds`. The new runtime is
`sha256:a4f291b85f5b0c72baa9d7c31fa4fed9e6669e8ff8d050410c4caa2bc6ef0340`;
the process ABI digest is
`bb45fca1f6eb10914d201877c47e2109e945dca5d6bd86355dda15b5f0366f12`.
All five images rebuilt successfully. Python's
browser fixture passes `close_fds`, `pass_fds`, explicit stdio, shared offsets,
pipe EOF and Meson-shaped compiler detection, plus Bonnie's real PEP 517
build/failure cleanup. All 203 source tests and the complete Chrome suite pass.
The clean scientific-package gate built and installed NumPy 2.5.2 and Pandas
3.0.5 through unchanged Meson 1.12.0. Fresh-process array/groupby computations,
transitive frontend installation, staging cleanup and raw-socket denial passed.
All five image inventory/help checks pass. No browser build is still running
for this scientific gate; it finished with status 0.

Native descriptor/sanitizer checks, all 54 Slop fixtures, and the real Chrome
descriptor/lifecycle fixture pass. The latter checks inheritance policies,
simultaneous mappings, malformed packets, failed-spawn cleanup, shared offsets
and independent flags, lowest-free allocation and pipe EOF. Evidence:
`build/fd-inheritance-runtime-build-final.log`,
`build/fd-inheritance-native-descriptors.log`,
`build/fd-inheritance-slop-native.log`,
`build/fd-inheritance-default-snapshot.log`,
`build/fd-inheritance-browser-descriptors.log`,
`build/fd-inheritance-python-snapshot.log`,
`build/fd-inheritance-python-browser.log` and
`build/fd-inheritance-python-pi-browser.log` (both Python images),
`build/fd-inheritance-browser-boundary.log` (still exactly 28 imports),
`build/fd-inheritance-all-snapshots.log`,
`build/fd-inheritance-source-tests.log`,
`build/fd-inheritance-full-chrome.log`,
`build/fd-inheritance-all-inventories.log`,
`build/fd-inheritance-pandas-browser.log`.
Local publication is a separate gate; `build/releases/current/release/source.commit`
identifies the source actually served on port 9000, not the working tree.

Useful evidence:

- `build/d5-d6-all-node-final.log`, `build/d5-d6-full-chrome.log`,
  `build/d5-bonnie-subprocess-snapshots.log`, `build/d6-help-*-current.log`.
- `build/d5-bonnie-subprocess-browser.log`,
  `build/d5-bonnie-subprocess-python-pi.log`,
  `build/d6-documentation-publication.log`, `build/d6-publication-negative.log`.
- `build/d5-bonnie-subprocess-pandas.log`: old descriptor rejection, superseded
  by the passing scientific gate above.
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

## Validated image-owned startup checkpoint

All five images now retain `/etc/dolly/init.slop` and execute it through the
source-built `/bin/foreground` command. Startup files, selected applications,
bounded Pi retries and recovery belong to the image, not the browser worker.
Foreground ownership and interactive roles live in Wasm. A child becomes
waitable only after Worker retirement; normal exit, startup failure, forced exit,
queued launches and abandoned descendants share the same cleanup path.

Advisory locks no longer pretend to succeed: `F_GETLK`, `F_SETLK` and `F_SETLKW`
return `ENOTSUP`, or `EBADF` for invalid descriptors. Native and browser fixtures
cover these errors without modifying the lock request.

Runtime: `sha256:9bda008611f887927ae5d2da9f311e3909130c0c421997f4984a2934f3f754b3`.
Process ABI: `3659a65f30869b8506116c3e12421df0fb5bd173277dad5b0888c3ad0a426203`.
All five images rebuilt; 203 source tests and the complete Chrome suite pass,
still with exactly 28 outer imports. The lifecycle fixture also checks failed,
missing, nonregular and cancelled `.dollyrc`, nested app/recovery shells,
inherited state, competing foreground claims and retired/pending orphan cleanup.
Selection remains usable while keyboard input is queued.
All five live inventory checks pass. A fresh `bonnie install pandas` also built
NumPy, Pandas and their frontend dependencies from source; fresh-process array
and groupby checks, staging cleanup and raw-socket denial pass on this runtime.

Evidence: `build/image-init-checkpoint-runtime.log`,
`build/image-init-checkpoint-snapshots.log`,
`build/image-init-checkpoint-source-tests.log`,
`build/image-init-checkpoint-lifecycle.log`,
`build/image-init-checkpoint-chrome.log`,
`build/image-init-checkpoint-inventories.log`,
`build/image-init-checkpoint-pandas.log`,
`build/image-init-native-descriptors.log`.

## Remaining work, in order

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

Revisit the legacy exit patches while doing this: `config/git-dolly.patch`
redirects Git's `exit` to `dolly_exit`, which bypasses libc's registered atexit
handlers, and still clears shared-repository state before exit. Add a failed
index-update/lockfile cleanup regression and prefer ordinary private-process
libc exit. The unused `dolly_execve` compatibility helper still implements
spawn/wait/exit rather than replacement; remove it or fail explicitly, and do
not use it for Git's spawn port.

### D1 — Finish one uninterrupted fresh-cache bootstrap

The last empty-cache run (`build/d1-complete-procedure.log`) finished with
status 1: toolchain, runtime, five images and 192 source tests passed, but its
frozen source hit the now-fixed Slop negation bug. Earlier runs fixed LLVM sparse
`libc`, Bison stdout contamination, wasm64 PIC builtins and Clang resource headers.
No clean bootstrap is currently running. On final sources, run README's
`npm ci` → external toolchain → `npm test`, with an explicit host tool PATH and
no copied workstation caches. All five images and the complete suite must pass
in that one run. Clean its owned checkout after closure.

Earlier owned checkouts and the obsolete diagnostic snapshot were moved to
system trash, recoverably. Preserve logs and the source-cache backup at
`build/d6-source-cache-backup.v3dj1y`; do not silently delete it.

## Closure rules

An operation census is not part of this audit: the user owns the API's design
and does not want profiling to become a prerequisite for it.

The goal includes **all remaining sections**, not only HTTP or publication.
An item closes with a minimal implementation, relevant real-browser evidence and
updated affected docs/recipes. Do not claim fresh NumPy/Pandas source builds,
all extended cold reproducibility checks, physical Safari/phone/audio tests or
real-provider sessions from unrelated green fixtures. Do not push/deploy merely
because local publication passed.
