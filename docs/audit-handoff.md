# Remaining audit work — handoff

Remaining work as of 2026-09-05. Completed findings have been removed; original
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

### Runtime adapters must preserve actual substrate behavior

**B3 — P1/P2 — Child/abort APIs report success without doing the work.** Mixed
public reproduction and source evidence. `src/runtimes/janis.js` ignores child
options, supplies a fake PID, discards stdin, and acknowledges ineffective kills;
`dolly-node.js` timeout signals do not expire and fetch checks abort only at
start. Pi tool cancellation also only checks before launch. Connect supported
env/input/wait/signal/deadline behavior to real process handles; explicitly reject
the rest. **Acceptance:** custom env and input reach children, mid-operation
abort/deadline stops child or HTTP work, and unsupported options fail clearly.
Outer Ctrl-C passing is not evidence that application abort signals work.

**B4 — P2 — Janis maintains conflicting file/env semantics.** Publicly reproduced:
`process.env.HOME` works but enumeration/spread is empty, and
`Buffer.from([1,2,3]).subarray(-1)` throws. Source evidence: `openSync` invents
descriptors, reads/writes reopen paths, stat/lstat share lstat behavior, and watch
objects never emit. Inspect `src/runtimes/{janis.js,dolly-node.js,quickjs-main.c}`.
Use real descriptor/environment operations and normal typed-array behavior;
reject unsupported watching. **Acceptance:** env keys/spread/has, negative slices,
open errors/exclusive creation, offsets, open-file rename/unlink, symlink stat,
and explicit watch failure.

**B5 — P2 — Python has an obsolete lazy subprocess model.** Source evidence in
`src/runtimes/cpython-subprocess.py`: execution begins at wait/communicate or
poll; output is spooled; poll can block; implicit cwd is not captured at creation;
terminate/kill alias a method requiring an argument. Adapt Popen to the same
spawn/pipe/wait/signal handles as other runtimes. **Acceptance:** observable start,
nonblocking poll, inherited creation-time cwd/env, streaming, communicate input,
terminate/kill, and wait status. Serial scheduling does not justify fake processes.

**B7 — P2 — libcurl accepts ineffective options.** Source evidence in
`src/libcurl-fetch.c`: several redirect/timeout/proxy/certificate/cookie/OAuth
settings return success without effect, and stored protocol restrictions are not
enforced by perform. This is not a demonstrated browser-policy bypass. Implement
useful semantics or explicitly reject unsupported options; document the finite
subset. **Acceptance:** each supported option changes behavior as promised, each
unsupported one fails, and no option weakens browser-owned policy.

**B8 — P2 — Two different libraries claim to be the C++ SDK.** Source evidence:
`modules/cpp.dm` publishes small hand-written ABI substitutes as `libc++.a` and
an empty `libc++abi.a`, while ordinary C++ uses full externally prepared archives
from `scripts/prepare-process-sysroot.sh` through `src/compiler.cpp`. Explicit
`-lc++` can choose the substitutes; kernel plugins use them intentionally.
Keep one honest process SDK; remove substitutes or name/scope them strictly as
plugin dependencies. **Acceptance:** implicit/explicit C++ linking selects the
same intended process runtime; exceptions, standard containers, Python C++
extensions, and resident-plugin builds still pass. External bootstrap libraries
are permitted; their identity must not be disguised.

**B9 — P2 — Selection/copy stalls while the foreground child is not reading.**
Reproduced in both Pi images during `! printf ...; sleep 8`; it works idle.
`src/dolly.c` services input events during terminal reads, while presentation and
the streaming-child path do not service selection. Handle terminal UI events
independently of stdin consumption. **Acceptance:** mouse selection and
Ctrl+Shift+C during sleeping/output-producing children, without stealing typed
input/paste or violating an exclusive game framebuffer lease.
The Slop checkpoint's shorter Pi streaming check passed without build load but
failed during a concurrent cold build; this does not close the longer B9 probe.

### Images must describe and preserve the delivered filesystem

**C3 — P1/P2 — Cold and prebuilt images differ beyond the recipe.** Source and
snapshot evidence: boot copies all seed `/usr`, including host-built utilities,
compiler/sysroot, and probes; `src/runtime-worker.mjs` runs a substantial
acceptance suite in production. All five audited snapshots omit `/bin/dollyfile`,
although cold bootstrap leaves it available. See `scripts/build.sh`,
`toolchain/CMakeLists.txt`, `src/dolly.c`, and `src/process/bootstrap.c`.
Define the minimal seed explicitly, move test-only programs/checks to the harness,
and decide whether Dollyfile execution is an installed user tool.
**Acceptance:** compare cold/prebuilt manifests and PATH inventories for each
image; production startup needs no undeclared test compiler/network work.

**C4 — P2 — Every image retains an oversized Zig SDK.** Measured baseline:
`/usr/lib/zig` accounts for about 199 MB and 19,662 files of the default snapshot,
including about 67.6 MB of Windows headers and a 10.2 MB compiler test.
`modules/zig.dm` retains the entire archive prepared in `scripts/build.sh`.
Derive a supported-target install manifest from real builds; do not blindly
delete foreign-named files. **Acceptance:** representative Zig, Ghostty, and user
builds pass, with measured image/file-count/boot-memory reduction.

**C5 — P2 — Sealing can omit ENTRY and loses filesystem kinds.** Source evidence
in `src/dollyfile.c`, `src/system-snapshot.c`, and
`scripts/build-system-snapshot.mjs`: ENTRY may exist during the build but not be
retained; image/layer capture rejects or dereferences symlinks and drops empty
directories. Session capture already has typed records. Share a small file,
directory, symlink, and deletion model where appropriate; no permissions layer.
**Acceptance:** retained ENTRY has valid executable ABI; missing entry fails
sealing; image/layer/session round trips preserve supported path kinds.

### Builds, publication, and maintenance must be truthful

**D1 — P1 — Clean bootstrap prerequisites are incomplete.** Source evidence:
`scripts/prepare-process-sysroot.sh` needs host `llvm-nm`, but
`scripts/build-toolchain.sh` only builds the two tblgen tools;
`scripts/prepare-cpython.sh` also requires undocumented host Python 3.14.
Declare/build prerequisites and test from an isolated fresh cache, preserving
the working cache. **Acceptance:** the documented procedure works without tools
accidentally inherited from this workstation. A full clean toolchain build was
not performed in the audit.

**D2 — P1 — Reproducibility verification can compare one artifact to itself.**
Reproduced: `scripts/verify-snapshot-reproducibility.mjs` reported two identical
rebuilds in under a second after the builder returned “snapshot is current” twice.
Distinguish up-to-date checking, isolated cold/cold reproducibility, and cold/cache
equivalence. **Acceptance:** prove both claimed builds executed, isolate cache
inputs, and fail on changed logical output. Do not cite the current command as
independent reproducibility evidence.

**D3 — P2 — C and JavaScript accept different Dollyfile languages.** Reproduced
with unchanged C parsing: `SLOP "cc" input.c` and quoted CWD differ from JS.
Source evidence also shows directory-valued LIB exports and missing duplicate
writer checks in C. Inspect `src/dollyfile.c`, `src/dollyfile-view.mjs`, and
`scripts/dollyfile-graph.mjs`. Prefer one parser/validator authority with inspection
output; differential fixtures are the immediate guard. **Acceptance:** quoting,
paths, object kinds, duplicate writers, retention, and row-by-row execution agree
between what the viewer promises and what the sandbox executes.

**D4 — P2 — Build/publication is not a coherent atomic transaction.** Source
evidence: packaging checks existence/size without fully binding snapshot, recipe,
runtime, source commit, and acceptance results; Pages downloads a release asset
without an expected artifact digest. `scripts/build.sh` deletes the served runtime
before replacement succeeds; overlapping browser and artifact-dependent tests
have failed during local rebuilds. This is not a finding that the audited public
site was stale. Stage a verified versioned artifact and publish atomically;
check the binding in `.github/workflows/pages.yml`. **Acceptance:** interrupted builds keep
the last good app; mixed/stale/tampered artifacts fail packaging/deployment;
all five packaged routes pass before promotion.

**D5 — P2/P3 — Duplication and misplaced image policy add complexity.** Source
evidence: commands are duplicated inline in modules and in `src/commands`;
`src/runtime-worker.mjs` knows Slop/Pi paths, startup/restart/recovery policy;
supervisor memory-size/reclamation-delay heuristics are not release guarantees;
packaged-prefix cache matching had no useful strict-prefix pair among the five
audited images; Bonnie hardcodes NumPy-specific build choices. Consolidate command
sources, move image behavior to ordinary init/entry files, and retain heuristics
or caches only with measured benefit. **Acceptance:** no divergent command copies;
image-specific behavior does not require host edits; cache/lifecycle changes keep
measured regressions covered; package policy is explicit rather than hidden.

**D6 — P3 — Cache keys, provenance, and documentation drift.** Source evidence:
Samurai keys omit preparation code; native Zig keys omit preparation code and
include absolute paths; some Git fetchers check HEAD but not dirty content.
HOST hashes still check served source bytes—no digest bypass was demonstrated.
Docs describe obsolete esbuild, failed-build layer disposal, timeout/stdin
behavior, Ghostty generation, missing packaged documents/tools, and a build ID
broader than its actual Wasm+data inputs. **Acceptance:** preparation changes
invalidate caches, relocated identical checkouts retain stable identities,
source verification handles dirty checkouts, packaged links/help inventories
work, and docs describe measured behavior. Preserve useful completed-module
caching on failure; correct its documentation instead of removing it by accident.

## Suggested checkpoints and closure rules

1. Resolve C5's system/layer path-kind limitations next. Normalize cold/prebuilt
   filesystems (C3) before enabling named saves for rebuilt images.
2. Consolidate B3–B5 on actual process/filesystem handles, and address B9 without
   mixing terminal UI events with child input. Resolve B7/B8 compatibility claims.
3. Close C3/D3 before making image-size pruning in C4 authoritative. Remove D5
   duplication as the corresponding owner becomes clear.

Fix D1/D2 before claiming clean/reproducible verification, and D4 before treating
the next publication as a provenance-checked release. Update D6 alongside each
affected change, not as an unrelated documentation rewrite.

An item closes only with a reproducer, the smallest in-scope fix, browser evidence,
and updated affected docs/recipes. Do not claim new NumPy/Pandas source builds,
all extended cold rebuilds, physical phone/Safari, audio, real-provider sessions,
or total resource containment from the current suite. Do not add new browser
authority to make tests pass. Preserve existing regressions.

## Evidence and restart commands

Latest local baseline: 163 Node tests, the full Chrome suite, multilingual Pi
streaming/tool round trips, and all five image boots passed. Build and test logs:
`build/utf8-final-build.log`, `build/utf8-node-tests.log`,
`build/utf8-browser-suite.log`, `build/utf8-pi-browser.log`, and
`build/utf8-{python,gamedev}-route.log`. Existing release archives predate this
checkpoint; none is a package of the latest changes.

Remaining-finding evidence includes `build/audit-2026-09-05.md`,
`build/slop-pi-browser-under-load.log` (B9), and
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
