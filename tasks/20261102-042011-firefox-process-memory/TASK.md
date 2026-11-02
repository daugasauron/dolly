# Firefox: a process costs 1.4 GB where Chromium's costs 0.85

- STATUS: OPEN
- PRIORITY: 180
- TAGS: core,memory,firefox

In `default`, after `amy install lean`, in a 6 GB browser slot (`tasks/20261027-232422-lean`):
Chromium's session holds 3.98 GB and a running `lean` adds about 0.85 GB, the first leaving
0.3 GB behind; Firefox's holds 4.52 GB, a `lean` adds about 1.4 GB, the first leaves 0.8 GB behind
and the cap kills the tab at `lake new`. Where does Firefox's extra memory go, and is any of it
Dolly's doing?

## State (2026-11-02): answered and one copy removed, `core/firefox-process-memory`

The extra memory is Firefox's: it compiles every function of a module eagerly in two tiers and
keeps both with the bytecode (5.7 times the module's bytes retained, Chromium's lazy V8 1.1 to
2.1 times), and its compile peaks 7 to 10 times the module's bytes above the floor (Chromium: none).
The "1.4 GB per process" is the first process's compile of the 214 MB `lean`; every later `lean`
costs what Chromium's does (0.5 GB). Dolly compiles once, posts one Module and shares it; what
Dolly did hold needlessly, a contiguous copy of the executable in kernel memory at every cold
launch, is gone (below). Left: the compiled-module cache's bound against Lean's executables
(a proposal below); Lean in Firefox still needs about 7 GB.

## How the runtime runs a program (read 2026-11-02)

`src/process-supervisor.mjs`: the supervisor copies the executable's bytes out of kernel memory
into one `Uint8Array` (`#takeImage`; Web Crypto rejects views of shared memory), hashes it,
parses it, and compiles it once with `WebAssembly.compile`. The `WebAssembly.Module` is posted to
every Worker of the process (each thread's too), which instantiates it; a Module sent by
structured clone shares its compiled code in both engines. The compiled module is cached by its
SHA-256 and by the file's version (`compiledModules`, LRU, 64 entries and 256 MiB of module
bytes), so a later spawn of the same executable compiles nothing. After a process ends its record
goes (`#acknowledgeRetirement`), with it the only other reference to the module; the supervisor's
bytes copy is garbage after the compile. Nothing in Dolly keeps a second copy or a per-Worker
compile. Before this branch the kernel made a copy of its own first: `dolly_process_image_read`
mallocked the executable's size and read the blocked file (`src/file-blocks.cpp` keeps files in
1 MiB blocks) into it, for the supervisor to copy from.

## Measured: one 96 MB module, `system`'s compiler

`build/firefox-memory-evidence/module-cost.mjs` (a 6 GB browser slot, the scope's anonymous
memory sampled every 100 ms, MB; `compiler` is `/usr/libexec/dolly/process-bin/compiler`, 96 MB,
run as `--dolly-toolchain-mode=c --version`; `compiler2` is a copy with an empty custom section
appended, so another module byte for byte). Logs: `module-cost-*.log`. Before the change:

| Step | Chromium | Firefox 155 default | Firefox, baseline only | Firefox, Ion only |
| --- | --- | --- | --- | --- |
| `compiler`, first launch: highest, then retained after 3 s | +306, +306 | +812, +544 | +809, +439 | +913 (10 s), +218 |
| `compiler`, second launch (module cached) | +0 | +0 | +0 | +0 |
| `cc -c a.c` (a real compile, cached module) | +33 retained | +3 | +4 | +11 |
| three `cc -c` at once, highest | +10 | +12 | +6 | +8 |
| four `cc -c` at once, highest | +35 | +11 | +11 | +9 |
| `cp compiler /tmp/compiler2` (96 MB written) | +0 | +4 | +0 | +1 |
| `compiler2`, first launch: highest, retained | +312, +312 | +935, +548..658 | +918, +447 | +1094, +378 |
| `compiler2`, second; `compiler`, third | +0; +0 | +0; +0 | +0; +0 | +0; +0 |
| `compiler` and `compiler2` at once, highest | +2 | +8 | | |
| two `cc -c` and two `compiler2` at once, highest | +17 | +10 | | |

Firefox prefs set through Playwright: `javascript.options.wasm_optimizingjit=false` (baseline
only), `javascript.options.wasm_baselinejit=false` (Ion only); a measurement, not something a page
can set.

What this says:

- Concurrent instances of one module, or of two, cost almost nothing in either browser (four
  compilers at once: at most 35 MB over one): compiled code is shared across Workers. Posting one
  Module is right.
- A second launch of a cached module costs nothing and leaves nothing: the module, its bytes and
  the supervisor's copy do not accumulate.
- The cost is per module, at its first compile, and it is the browser's. Chromium (V8, lazy
  compilation) retains the wire bytes it keeps and the functions it compiled. Firefox retains
  5.7 times the module's bytes: it compiles every function eagerly in two tiers and keeps the
  bytecode, the baseline code (the larger part: 4.6x alone) and the Ion code. Compiling, Firefox
  also peaks 8 to 10 times the module's bytes above the floor, whichever tiers run (its parallel
  compile's working memory); Chromium has no such peak.
- Scaled to Lean: `lean` is 214 MB and `lake` 228 MB. Firefox retains about 1.2 GB per compiled
  one and peaks about 2 GB above the floor while compiling it; Chromium retains about 0.3 GB and
  peaks no higher. Lean's measured numbers (the first `lean` leaves 0.9 GB in Firefox, 0.35 in
  Chromium; a later `lean` adds 0.5 GB in both) fit: Firefox's "1.4 GB per process" is the first
  process's compile; every later process costs what Chromium's does.

## Dolly's share

1. The kernel's contiguous copy, removed on this branch. `dolly_process_image_read` mallocked
   the executable's size in kernel memory and read the file into it; the supervisor copied it out
   and the kernel freed it. A Wasm memory never shrinks: when no free chunk that large existed
   the kernel grew by the file's size at the first launch of an executable, retained in both
   browsers until a later allocation reused it. Evidence: in every run above `cp` of 96 MB grew
   nothing (the freed copy held the new file's blocks) and `compiler2`'s launch then cost what
   `compiler`'s did. After `amy install lean` the install's freed buffers held `lean`'s copy,
   which is why Lean's first process left only 0.35 GB in Chromium. Now `dolly_process_image_block`
   gives the supervisor each 1 MiB block of the file's own bytes (`DOLLY_FS_BLOCK_SIZE`,
   `abi/dolly-supervisor-0.wat`), which it gathers into its one `Uint8Array`: `image_read` and
   `image_address` are gone, `image_size` is the size or a negative errno. Same fixture after
   (`module-cost-*-after.log`, anonymous MB):

   | Step | Chromium before | Chromium after | Firefox before | Firefox after |
   | --- | --- | --- | --- | --- |
   | `compiler`, first launch: highest, retained | +306, +306 | +219, +202 | +812, +544 | +669, +451 |
   | `cp compiler /tmp/compiler2` | +0 | +98 | +4 | +98 |
   | `compiler2`, first launch: highest, retained | +312, +312 | +191, +103 | +935, +548..658 | +704, +553 |
   | the whole run's peak (memory.peak) | 1190 | 1164 | 2389 | 2140 |

   The first launch retains about 100 MB less and peaks 90 to 240 MB lower in both browsers; the
   growth that remains is the `cp`'s, a real file. Chromium's retained compiled module is then
   its wire bytes and little more (+103 for 96 MB); the rest of the first launch's +202 is the
   supervisor's copy, garbage until a collection (the −104 MB and −110 MB steps in the logs).
   Lean after an install will not move: its copy fit the install's freed memory. The 128 MiB
   `kKernelReserve` in `src/file-blocks.cpp` was sized for this copy ("the compiler is 78 MB");
   it now only keeps the kernel's own allocations possible when files fill memory, and its
   figure is a guess. `docs/process-model.md` and `Dollyfile-dolly-docs` follow (the WAT is a
   platform document: `dolly-docs` and the 11 images that hold it are repinned, a catalog round).
   No test asserts the saving: a bound on retained memory after a cold launch sits inside the
   collector's timing (the supervisor's copy is 96 MB of garbage) and the browsers' own costs.
2. The supervisor's copy is garbage after the compile, collected at the next major collection.
   Transient; Web Crypto needs a private buffer.
3. The cache bound: 256 MiB of module bytes (`compiledModuleCacheBytes`, set at checkpoint
   b95459ce when the compiler was 78 MB). Lean's executables are `lake` 228, `lean` 214, `leanc`
   102 and the compiler 96 MB: no two of the first three fit. A `lake build` of more than one
   module alternates `lean` and `leanc`, so each module recompiles one of them, and compiling
   `lean` evicts the running `lake`, which is recompiled at the next `lake`. Each recompile costs
   Firefox 0.5 s per 100 MB and a transient peak of 8 to 10 times the module (2 GB for `lean`);
   Chromium 0.2 s and about the module's size. The eviction of a live process's module frees
   nothing (its process holds it) and loses the next hit. The catalog's executables of 50 MB or
   more (`catalog-executables.txt`): rustc 248, zig 228, lake 228, lean 214, codex 199, leanc
   102, mojo 96, the compiler 96, cmake 77, ghostty 72, Go's compile 58, llc 50. The bound holds
   one of the largest at a time. Not changed: with Lean's four cached (640 MB) Chromium would
   retain about 0.7 GB more after `lake build` and the demo test that passes at 6 GB (peak 5.58)
   would not, so at a 6 GB cap the thrash is the price of fitting; a rule that spares live
   modules changes nothing for Lean (the LRU evicts `lake` at its exit anyway). Proposal below.

## Proposals

- The cache bound is a trade-off with measured coefficients: an idle cached module costs Firefox
  5.7x its bytes retained and Chromium about 1.1x, a recompile costs Firefox 8 to 10x
  transiently and 0.5 s per 100 MB. A session with memory to spare (above 8 GB) is better off
  with Lean's set cached (768 MiB would hold it and Rust's rustc with the compiler); a 6 GB
  session is not. If the page knows its memory (`navigator.deviceMemory` is Chromium's only), the
  bound could follow it; otherwise it is the owner's number.

## Verified (b59e558e, 6 GB browser slots)

The source suite (466), `test/core-browser.mjs`, `test/process-memory-browser.mjs` and
`test/process-browser.mjs` in Chromium and Firefox; the fixture above in both. `npm run build:runtime`
prints the same image inputs (a58af3f9). `test/fs-growth-browser.mjs` crashed Chromium's tab in
the slot: it fills 8 GiB of kernel memory by design (`test/browser-tests.mjs` runs it alone), which
a 6 GB cap kills; it needs the integrator's scope, and the change leaves `grow`, `reserve` and
`release` untouched.

Lean after the change (`build/lean-evidence/lean-measure.mjs`, the demo test's steps, anonymous GB
at the step's highest, then after it), Chromium in a 6 GB slot, every step passing: install 4.05,
3.98; `lean --run` 4.92, 4.36; theorems 4.66, 4.90; the false theorem 4.90, 4.37; `lake new` 4.83,
4.32; `lake build` 5.56, 4.89. The Lean task's "after `core/process-memory`" column within 0.1 GB
at every step, as predicted: after the install, the kernel's copy of `lean` fit the install's
freed memory. Firefox, same slot (`lean-measure-firefox-after.log`): install 4.57, 4.42; `lean
--run` 5.33, 5.11; theorems 5.67, 5.12; the false theorem 5.57, 5.13; `lake new` killed by the cap
as before. Against the Lean task's column (4.67, 4.52; 5.85, 5.43; 5.90, 5.44; 5.95, 5.44) the
steps after the first `lean` sit 0.3 GB lower, one run each: the first `lean` left 0.7 GB where
it left 0.9. Firefox still needs about 7 GB for `lake`.

## Not measured

Lean itself in Firefox beyond 6 GB. Firefox's `about:memory` cannot be driven from a Playwright page.

## Lessons

- Firefox's "per process" cost was the first process's: separating first, second and concurrent
  launches of one module attributes memory in three steps where a per-step table of a whole
  session does not.
- A copy of a 96 MB executable with an appended custom section is a second module for the price
  of a `cp`: the engine's per-module and per-instance costs separate without building anything,
  and the `cp` itself showed where the kernel's freed copy had gone.
- Playwright's Firefox prefs turn the engine's tiers off one at a time: an attribution of the
  retained memory to baseline code, Ion code and bytecode in two one-minute runs.
- A kernel change that is not an image input still repins the docs image when it touches a
  contract under `abi/`: the source suite's stale-pin check found it before the browser did.
