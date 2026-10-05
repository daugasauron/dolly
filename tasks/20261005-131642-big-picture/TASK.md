# Big-picture review: is Dolly still on its original design and intent?

- STATUS: CLOSED
- PRIORITY: 320
- TAGS: core,review,design

Owner (2026-10-05): "use fable to go review the 'big picture' to keep the
project on track in the original design and intent."

## Work

Judge the tree as it is against each statement of `AGENTS.md` (goal, thesis,
Zen, hard constraints, interface layers, runtime model, rules), `README.md`,
`host/README.md`, `docs/` and `abi/`. Measure where a claim needs a number:
trusted browser lines, kernel lines, outer imports, catalog shape, core versus
demo weight, time from an edit to a verified result. Read the three sandbox
audits (`~/Downloads/AUDIT-sandbox-painpoints.md`, `~/Downloads/AUDIT-session-latency.md`, `~/Downloads/AUDIT-browser-runtime.md`): they are an agent's view of the product from inside.

## Done when

- Findings are recorded here with file references: where the project drifted
  from its intent, what to delete, and the next core steps in order.
- Each actionable finding is its own task or a note on an existing one; open
  tasks that no longer serve the goal are closed with the reason.
- The owner gets one ranked list of at most ten items.

## Findings (2026-10-05, `integrate/1005` at `c5b9e132`)

Method: read `AGENTS.md`, the READMEs, `docs/`, `abi/`, every open task and
the three audits; read the code behind each claim; measured with `wc`, `grep`,
`git log` and the repository's own Wasm parser (`src/wasm-interface.mjs`) on
the artifacts built in `work/host-modules/dist`. Nothing was built and no
browser was run, so every statement about behaviour comes from reading code,
from the audits or from task records, and is marked where it matters.

### Measurements

| What | Number |
| --- | --- |
| Kernel C in the tree | 5,763 lines (3,805 in `src/`, 1,958 in `host/*/kernel.c`); `dist/dolly.wasm` 211,666 bytes |
| Reviewed trusted JavaScript | 9,106 lines (`src/*.mjs` 4,942, `host/**/*.mjs` 4,164); 7,600 on 09-30, 8,594 on 10-01 |
| Generated trusted JavaScript | `dist/dolly.mjs` 48,429 bytes minified; `dist/dolly-seed.mjs` 85,153 bytes (root rebuilds) |
| Outer imports (`abi/dolly-browser-0.wat`) | 30: the memory, 5 Dolly-named, 24 Emscripten- or WASI-named |
| Kernel exports | 129: 61 `dolly_*` (in contracts), 38 WasmFS, 26 libc, 4 Emscripten; 43 named by no contract |
| Process contract | 1 import, 56 operations, 652-line `process.h` |
| Host modules | 11 (`runtime`, `http`, `download`, `upload`, `snapshot`, `display`, `gpu`, `audio`, `threads`, `build`, `packages`) |
| Catalog | 51 recipes: core 12 (1 application, 7 toolchains, 4 packages), demos 39 (12, 17, 10) |
| Host lines declared | `http@0` 44 of 51, which is all 37 applications and toolchains; `display` 36, `download` 33, `upload` 31, `snapshot` 19, `threads` 18, `gpu` 7, `audio` 2 |
| Tree, text lines | core about 47,000 (`src` 27,956 without one generated table, `host` 8,389, `scripts` 4,655, core recipes 2,931, `config` 1,573, `include` 820, `abi` 433); `test` 11,756; `demos` 62,953 in 524 files; `tasks` 24,339 in 348 files; `docs` 1,483 |
| One generated file | `src/ghostty/generated/uucode-tables.zig`: 233,478 lines, 89% of the lines under `src/` |
| In-house userspace C | Slop 4,767; recipe engine 2,082; commands 2,867 in `src/commands/` plus 1,638 inline in `Dollyfile-system-build`; libcurl work-alike 948 |
| Tests | core: 35 source files, 22 browser suites, 2 artifact files; demos: 133 files, 10,817 lines |
| Commits since 09-30 (387) touching | `tasks/` 158, `demos/` 101, `src/` 97, `test/` 86, `docs/` 62, `host/` 47; lines added: demos 13,491, tasks 6,992, src 4,709, host 4,405 |
| Turnaround | kernel edit 9 s + 20-25 s per browser; any image command 124 s of preparation first; seed edit 843 s (`default` chain) or about 3.5 h (catalog) |

### On track: do not touch

- The process contract: one import, bounded packets without pointers, its own
  enums, an identity that hashes exact bytes (`abi/dolly-process-0.wat`,
  `include/dolly/process.h`). This is the interface the thesis asks for.
- Private memory per process with the policy-free gate; process failure leaves
  the kernel and shell alive.
- One network edge with policy outside Wasm; `build@0` and `packages@0` as
  reserved origins behind it, adding no import. No agent-specific host API
  has appeared: the feared drift did not happen.
- The host-module manifest and digest mechanism, and the 204-line page shell
  that names no module (`src/browser.mjs`).
- The core never depends on a demo: the only references from core code are
  generic scans of `demos/*/` (`scripts/recipe-files.mjs`,
  `scripts/prepare-image-sources.sh:39`, `scripts/image-menu.mjs`). The one
  exception is the root `package.json`, whose only runtime dependencies are
  Pi's packages (note on `20261005-131647-pi-1`).
- Dollyfile 6: inline pins that cascade, explicit retention, packages as the
  only unit of reuse, `amy install` executing the same row.
- The kernel's size, and `docs/` (1,483 lines, precise, linked to code).

### Drift

1. **The perimeter is mostly Emscripten's, and generated.** 24 of the 30 outer
   imports carry Emscripten or WASI names; `host/modules.mjs:149-160` leaves
   the runtime module's imports to the 48 KB minified `dist/dolly.mjs`;
   trusted code calls Emscripten's `FS` object at 11 sites; 43 kernel exports
   are in no contract; `src/runtime-worker.mjs:152-153` hides
   `globalThis.TextDecoder` to make the glue load. Processes were freed from
   Emscripten's JavaScript; the kernel, where the authority is, was not. The
   secondary goal (a backend-independent API) is blocked on this, and no task
   covered it. -> `20261005-133401-kernel-boundary`.
2. **The compile target has no name of its own.** `cc` compiles for
   `wasm64-unknown-emscripten` (`src/compiler.cpp:473`), so upstream code
   takes its Emscripten paths and ports undo that with private spellings
   (`-U__EMSCRIPTEN__`, `-DDOLLY`, patched `#if`s). Error numbers are the
   libc's and outside the hashed contract. `AGENTS.md` calls the adapter a
   bootstrap; 51 images and every port now build on it.
   -> `20261005-133402-target-identity` (owner decision).
3. **The agent is the user, but the system talks to the person at the page.**
   The audits' common thread is silence. Read in code: supervisor diagnostics
   go to the terminal device, not to the failed program's stderr
   (`src/process-supervisor.mjs:657-670`), so an agent with captured output
   sees nothing; input records are dropped without a count; a host blocked
   by CORS and a host that is down print the same line (only a policy refusal
   differs, `src/libcurl-fetch.c:346-352`). The interface is specified in the
   repository and enforced by loaders, yet no image holds a file describing
   it, while the same facts are hand-copied into `help` and the Pi skill.
   -> notes on `20261005-131643-silent-126`, `20261005-131649-git-fetch`,
   `20261005-130240-pi-skills`; new `20261005-133403-self-description`.
4. **Presence does not imply function.** `gpu.h`, `audio.h`, `threads.h` and
   their client archives are in every image and `cc` links them, but only an
   image whose recipe declares the module may run the result; `git` is a core
   port that cannot reach github.com from the public site; `install -m`
   and `chmod` accept and do nothing. `AGENTS.md`: "an unimplemented
   operation cannot return success". Tracked in tonight's tasks; the
   structural part is that a host set is fixed per image and all 37
   applications and toolchains declare `http@0` because the recipe engine is
   retained in every base, so the manifest's most important line carries no
   information. -> `20260930-231300-lean-game-images` (re-scoped to core).
5. **The shell's rule changed without a decision.** `docs/slop.md` admits
   features "only when a useful source build needs them"; tonight's batch adds
   them because an agent typed them. `AGENTS.md` still says "prefer simple
   serial semantics", while the kernel runs concurrent processes and only
   Slop's pipelines are serial. Slop is 4,767 lines and its target is now, in
   effect, the shell language agents write. -> `20260930-100000-audit-32`
   (raised), note on `20261005-131650-userspace-gaps`, owner decision below.
6. **Work-alikes instead of upstream.** 4,505 lines of in-house commands
   beside the sbase the image already builds, a 948-line libcurl, a
   1,491-line Cargo (`demos/rust/patti.c`), a Node shim. Each is a strict
   subset, and the audit's list of command gaps is the list of those subsets.
   The rule is "prefer unchanged upstream source". -> `20260930-100000-audit-36`
   closed into `20261005-131650-userspace-gaps`.
7. **Priorities inverted the stated values.** Before this review the open
   perimeter and iteration tasks sat at 100-160, under self-hosting Rust
   (250), 0 A.D. (270) and demo recordings (250). `npm run build` and
   `npm run test:full` have failed since `3162a565` (five days) and nobody
   noticed. Trusted JavaScript grew 20% in five days under an open task to
   shrink it. -> `20260930-100000-audit-53` (three tasks merged, 300),
   `20260930-100000-audit-24` (250).
8. **Weight outside the product.** `tasks/` gained more lines since 09-30
   than `src/` or `host/`; 295 closed task files (about 20,500 lines) stay in
   the tree, nearly half the size of the core source. One generated table is
   89% of `src/`. Demos are 51% of the non-task, non-generated tree and 26% of the
   commits; that is acceptable while the core never depends on them, and the
   check holds.

### Ranked list for the owner

1. Take Emscripten's JavaScript out of the kernel's boundary, starting with
   the output devices, which need no image rebuild.
   `20261005-133401-kernel-boundary`.
2. Report every refusal to the program that asked, not to the terminal: one
   rule that fixes the silent 126s and belongs in `docs/process-model.md`.
   `20261005-131643-silent-126`.
3. Make iteration measurable and fast: a working-tree server, a full check
   that runs, no 124 s preparation before a cache hit.
   `20260930-100000-audit-53`.
4. Decide the target's identity, then spend one seed round on it together
   with `input@0` and the pending seed batches, not four catalog rebuilds.
   `20261005-133402-target-identity`, `20261002-072000-input-host-module`.
5. Run external pipeline stages concurrently, with `xargs -P`, `&` and `wait`
   on the same mechanism; the decision is already recorded.
   `20260930-100000-audit-32`.
6. Ship the interface's documents inside the image as a package and delete
   the hand-kept copies. `20261005-133403-self-description`.
7. Build a compiler-free core base and make the toolchain a package, so an
   image can declare no network and `gpu-sdk`/`audio-sdk` can go.
   `20260930-231300-lean-game-images`.
8. Fix the userspace gaps by replacing in-house commands with upstream ones,
   and count the lines removed. `20261005-131650-userspace-gaps`.
9. Hold trusted JavaScript to a recorded number per release; decide whether
   DSO and FFI (11% of it, two demo users) become a declared module.
   `20260930-100000-audit-24`, `20261002-073000-runtime-process-modules`.
10. Close `20261001-000000-host-modules` after the contract batch's
    full-catalog checks run, and leave the pattern alone.

### Decisions only the owner can make

1. **The target's identity** (`20261005-133402-target-identity`): does a
   program compiled in Dolly see `__dolly__` or `__EMSCRIPTEN__`, and do
   error numbers enter the hashed contract? It is the API's shape and costs a
   full rebuild whenever it is taken; later costs more ports.
2. **What Slop is for.** Either a finite shell for source builds, as
   `docs/slop.md` says, or the shell agents write, as tonight's batch
   assumes. If the second: reword `AGENTS.md`'s "prefer simple serial
   semantics", give Slop a stated target (POSIX `sh` without job control) and
   consider measuring a real spawn-only shell against it before Slop grows
   further. busybox-w32's `ash` runs on a platform without `fork`; whether it
   fits Dolly is unmeasured.

Smaller, each a yes or no: accept the recommendation in
`20261002-073000-runtime-process-modules` (it then closes); run a git relay
for the public site (`20261005-131649-git-fetch`); delete closed task
directories from the tree at each release, leaving them to `git log`.

### Task changes made by this review

- New: `20261005-133401-kernel-boundary` (325),
  `20261005-133402-target-identity` (300),
  `20261005-133403-self-description` (290).
- Re-scoped and raised: `20260930-100000-audit-53` (150 -> 300, now the one
  iteration task), `20260930-231300-lean-game-images` (180 -> 280, core),
  `20260930-100000-audit-32` (180 -> 290), `20260930-100000-audit-24`
  (150 -> 250). Lowered: `20261001-232300-gpu-visibility` (290 -> 200).
- Closed as done, with evidence: `20260930-100000-audit-10`,
  `20260930-100000-audit-12`, `20260930-100000-audit-22`.
- Closed as merged: `20260930-100000-audit-52` and `20260913-105437-codex-16`
  (into audit-53), `20260930-100000-audit-08` and `20260930-100000-audit-18`
  (into kernel-boundary), `20260930-100000-audit-58` (into audit-24),
  `20260930-100000-audit-36` (into userspace-gaps),
  `20260930-100000-audit-46` (into self-host-rust),
  `20260930-220200-demo-page` (into demo-recordings).
- Review notes appended to: host-modules, input-host-module,
  runtime-process-modules, silent-126, git-fetch, pi-skills, more-packages,
  pi-1, userspace-gaps, self-host-rust, zig-follow-ups.
- Open tasks: 41 before, 32 after.
- Documents corrected: `README.md` said `system` adds HTTP and file transfer
  to `system-tools`, which already has both (it adds `snapshot@0` and
  `session-recover`); `docs/http.md`'s diagram named files that moved to
  `host/http/`.

### Not verified

- Whether the kernel links without Emscripten's JavaScript at acceptable
  cost: the new task starts with that measurement.
- The audits' behaviour was not reproduced here; tonight's tasks do that.
- `abi/dolly-process-0.wat:21-22` still describes `HTTP_BODY_WRITE (83)`,
  which moved to the HTTP module's contract. Left alone: it is a contract
  file, and the comment should go with the next ABI change.

## Closed (2026-10-05)

Done-when checked: findings with file references are above; each actionable
finding is a task or a dated note; eleven tasks are closed with reasons; the
ranked list has ten items.
