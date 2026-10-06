# Own the kernel's outer boundary: load the kernel without Emscripten's JavaScript runtime

- STATUS: CLOSED
- PRIORITY: 325
- TAGS: core,boundary,abi,architecture

## Remaining (2026-10-07)

Reopened by the triage: the branch closed it, but the candidate (`main` at
`ab412d94`) holds steps 1, 2 and 4 only (`ff3a5c19`, `82d659d8`, `fb6c3463`:
nine Dolly-named imports, 90 exports named by contracts, no `dist/dolly.mjs`,
`TextDecoder` untouched; the catalog of 67 images was built by that kernel).
One generated file is still loaded there: `dist/dolly-seed.mjs`, the file
packager's index (`src/runtime-worker.mjs:146`), so the first done-when line
does not yet hold on `main`. Step 3 (the seed as a Dolly snapshot) removes
it: finished on `core/kernel-boundary-2` at `663b9a5a`, verified before its
rebase (below), rides `integrate/round3`; closes when round 3 merges. The two
tasks it raised (`20261006-140347-kboundary-01`, `20261006-142127-kboundary-02`)
arrive with that branch (`e5ae6730`).

From the big-picture review (`20261005-131642-big-picture`). `AGENTS.md` names
the kernel's outer imports and their trusted implementations as the security
perimeter and asks that authority decisions stay "short and directly
reviewable by a human". Every Dolly process is already a standalone Wasm
module that Dolly's own JavaScript instantiates with one import. The kernel is
the one module still instantiated by Emscripten's generated JavaScript, and
most of the perimeter is that generated code.

## Result (2026-10-06 night)

The kernel is loaded by Dolly's own Worker with nine imports, every one
Dolly-named, typed in `abi/dolly-browser-0.wat`, owned by a manifest and
provided by that module's `bindings`. No generated JavaScript is loaded.

| | Imports | Exports | Generated JavaScript loaded |
| --- | --- | --- | --- |
| Before (`bef23f6b`) | 30 | 130, 43 named by no contract | `dolly.mjs` 48 KB, `dolly-seed.mjs` 85 KB |
| After (`core/kernel-boundary-2`) | 9 | 90, all named by a contract | none |

| Ref | Holds | State |
| --- | --- | --- |
| `core/kernel-boundary-step2` | step 2 on `bef23f6b` | merged into `integrate/next` |
| `core/kernel-boundary-step4` | step 4 on step 2's merge (`7e39f6ee`) | merged as `fb6c3463`; tonight's catalog is built by it |
| `core/kernel-boundary-2` | step 3, rebased onto `integrate/next` (`80595976`) | verified before the rebase; waits for the next seed round, since it changes image inputs |

Each done-when line, and where it is shown:

- Imports from `host/*/` providers, no generated JavaScript, `TextDecoder`
  untouched: steps 4 and 3 below; the boundary suite instantiates a kernel in
  the page from the providers alone.
- Only Dolly-named imports, counted before and after: 30, then 24 (step 2),
  then 9 (step 4); an artifact test fails on any other name.
- Every export named by a contract: the artifact test compares the two sets
  exactly (step 4).
- The two refusals: in the boundary suite, against a real kernel (step 4).
- Suites and the root rebuild: at every step, below; `system-build` from the
  root has the same bytes at each (`e5a4ac80…`).

`core/kernel-boundary-2` after the rebase (2026-10-06, 23:25): runtime
`4d72d1e1…`, image inputs `08086c58…`, 9 imports, 90 exports, the build's
exact import check passes; source 399 of 400, the one failure being the docs
package's pins, which the branch no longer carries (400 of 400 once repinned,
`rebased/source-repinned.log`). The conflict in `src/dolly.c` took the
integrator's table without `SHELL`. No browser suite ran on the rebased tree:
its images do not exist yet.

Raised from here: `20261006-140347-kboundary-01` (file growth in Chrome after
a refused one) and `20261006-142127-kboundary-02` (trusted code still holds
the exports as `dolly._NAME`; the rename exists and is held back by an
unexplained Firefox failure). The catalog round, not this task, loads the
large images.

## Evidence (`integrate/1005` at `c5b9e132`; artifacts from `work/host-modules/dist`)

- `abi/dolly-browser-0.wat` lists 30 imports: the memory, 5 with Dolly names
  (`dolly_http_dispatch`, `dolly_gpu_dispatch`, `dolly_audio_dispatch`,
  `dolly_download_dispatch`, `dolly_bootstrap_write_bytes`) and 24 with
  Emscripten or WASI names: 8 `_wasmfs_get_preloaded_*`/`_wasmfs_copy_preloaded_*`,
  6 `_wasmfs_jsimpl_*`, 5 `wasi_snapshot_preview1.*`, `emscripten_out`,
  `emscripten_err`, `emscripten_date_now`, `emscripten_resize_heap`, `_abort_js`.
- `host/modules.mjs:149-160` (`bindImports`) binds only the imports of modules
  other than `runtime`. The 26 imports `host/runtime/module.json` owns keep the
  implementation Emscripten generated: `dist/dolly.mjs`, 48,429 bytes on two
  minified lines, which also contains `fetch(` twice and `XMLHttpRequest`
  once. `host/runtime/runtime.mjs` (120 lines) supplies four options to it.
  The WAT pins the import types; the code behind 24 of them is Emscripten's
  library, which nobody here reviews.
- Trusted code drives the kernel's filesystem through Emscripten's JavaScript
  `FS` object at 11 call sites (`src/runtime-worker.mjs:59,60,185,186,190,218,259`,
  `host/runtime/runtime.mjs:107,108,118`, `host/snapshot/snapshot.mjs:81`), linked
  with `-sFORCE_FILESYSTEM=1` and
  `EXPORTED_RUNTIME_METHODS=FS,FS_createPath,FS_createDataFile,addRunDependency,removeRunDependency`
  (`toolchain/CMakeLists.txt:66,78`). The kernel therefore exports 129
  symbols: 61 `dolly_*` (the contracts), 38 `_wasmfs_*`/`wasmfs_*`, 26 libc
  (25 of them named by `abi/dolly-kernel-plugin-0.wat` for the display
  plugin) and 4 `emscripten_*`. 43 exports are named by no contract: the 38
  WasmFS ones and 5 of Emscripten's runtime.
- Terminal output leaves Wasm and comes straight back: `installOutputDevices`
  (`host/runtime/runtime.mjs:104-120`) registers three JavaScript devices whose
  `write` calls the kernel export `_dolly_terminal_write_bytes`. The six
  `_wasmfs_jsimpl_*` imports exist for these three devices.
- A workaround in the core: `src/runtime-worker.mjs:147-153,173` sets
  `globalThis.TextDecoder = undefined` while the glue loads, because the glue
  decodes views of shared memory.
- A root build loads the seed through Emscripten's file packager:
  `scripts/prepare-kernel-seed.sh`, `dist/dolly-seed.mjs` (85,153 bytes,
  generated) and the eight preload imports, while the kernel already restores
  images through its own stream (`dolly_snapshot_stream_write`,
  `abi/dolly-image-0.wat`).
- The secondary goal (an API that can be "specialized independently of the
  backend") cannot be met while a backend must reproduce Emscripten's private
  JavaScript library interface.

## Work

Measure first: link the kernel the way processes are linked (no JavaScript
output) and record which imports remain and why. Then, in steps that each keep
the browser suites passing:

1. Output devices as a kernel WasmFS backend in C++ beside
   `src/file-blocks.cpp`; the `_wasmfs_jsimpl_*` imports and
   `installOutputDevices` go.
2. Kernel exports for what trusted code does through `FS` (make a directory,
   read a bounded file, remove a file), like the existing `dolly_write_file`
   of `abi/dolly-image-0.wat`; `FS` and its runtime methods go. The bounded
   read is the one place the boot files are checked.
3. The seed as a Dolly snapshot restored through the existing stream; the file
   packager, `dist/dolly-seed.mjs` and the eight preload imports go.
4. Clocks, entropy, startup environment, memory growth, abort and boot text as
   Dolly-named imports implemented in `host/runtime/runtime.mjs`;
   `dist/dolly.mjs` and the TextDecoder workaround go.

Step 1 is a kernel and page change: images stay valid while
`npm run build:runtime` prints the same `image inputs` hash. Step 2 adds
kernel exports; `dolly-image-0.wasm` is one of the image build inputs
(`scripts/write-build-id.mjs:8-11`), so exports added to that contract
invalidate every image. Put them in the supervisor contract, or take step 2
with steps 3 and 4, which change the seed loader and belong to the next seed
round.

## Measurements (2026-10-06, `core/kernel-boundary`, image inputs `2cc92c2b…`)

Evidence is under `build/kernel-boundary-evidence/` in `work/signals`.

- **The kernel links without JavaScript.** The unchanged kernel objects linked
  with `-sSTANDALONE_WASM=1` to a `.wasm` output give 13 imports and 89
  exports in 196,562 bytes (the JavaScript link: 30, 129, 211,729). The link
  needed `-Wl,--allow-multiple-definition`, because `src/dolly.c` and
  Emscripten's `libstandalonewasm` both define `_wasmfs_stdin_get_char`.
  - Imports left: the memory, the 5 Dolly-named ones,
    `emscripten_notify_memory_growth` and six of WASI: `fd_write` (behind
    `emscripten_out`/`emscripten_err`, WasmFS's own stdout and stderr),
    `environ_sizes_get`, `environ_get`, `clock_res_get`, `clock_time_get`,
    `random_get`.
  - The other 19 exist only because the output is JavaScript:
    `libstandalonewasm` answers the eight preload queries with zero, grows
    memory with `memory.grow`, traps on abort and reads `emscripten_date_now`
    from `clock_time_get`; the six `_wasmfs_jsimpl_*` are not linked at all.
  - Exports left outside a contract: `_initialize`,
    `_emscripten_stack_restore`, `emscripten_stack_get_current`.
- **What the kernel calls** (one snapshot boot of `default` plus
  `test/core-browser.mjs` in Chrome, every import counted at instantiation):
  `emscripten_date_now` 741,634; `_wasmfs_jsimpl_get_size` 167,299;
  `_wasmfs_jsimpl_write` 11,093; `clock_time_get` 2,897; `random_get` 50;
  `emscripten_resize_heap` 11; `_wasmfs_jsimpl_alloc_file` 3;
  `environ_sizes_get`, `environ_get`, `_wasmfs_get_num_preloaded_files` and
  `_wasmfs_get_num_preloaded_dirs` 1 each. Never called: `_abort_js`,
  `emscripten_out`, `emscripten_err`, `clock_res_get`, the other six preload
  imports, `_wasmfs_jsimpl_read`, `_free_file` and `_set_size`. A root rebuild
  was not counted; there the seed loads after WasmFS has started, so the
  preload counts are zero too (read in `libwasmfs.js`, not measured).
- Emscripten's glue passes one object as both `env` and
  `wasi_snapshot_preview1`: every function is reachable under either name.
- Its startup environment (`getEnvStrings` in `dist/dolly.mjs`) gives the
  kernel `LANG` from `navigator.language` and `PWD=/`; `src/dolly.c` replaces
  or unsets the rest. Measured in Chrome: `env` in the `default` shell prints
  `LANG=en_US.UTF-8` (`PWD` there is Slop's). Headless Chrome and Firefox both
  report `en-US`, so that is the value every image was built with.

## Plan as changed by the measurement

- The six `_wasmfs_jsimpl_*` imports do not belong to the output devices.
  Emscripten links them whenever `-sFORCE_FILESYSTEM=1` builds its JavaScript
  `FS` object (`$FS__deps` in `libwasmfs.js`). Step 1 therefore removes
  `installOutputDevices` and every call to them, and the imports go with `FS`
  in step 2.
- Step 2 keeps the `image inputs` hash and, since the receipt fix, the bytes
  of every image measured (below). Step 4 is expected to keep images valid;
  that is not measured. Until step 3 the file packager's generated index
  runs against five functions of the Worker instead of Emscripten's module
  (as `test/dolly.artifacts.mjs` already loads it); the seed has no empty
  directory (56 directories, 822 files, checked).
- No abort, memory-growth or environment import is needed: abort is a Wasm
  trap, growth is `memory.grow` on the shared memory, and the kernel sets its
  own environment. The target is 9 imports: the memory, boot text, the four
  dispatches, two clocks and entropy.

## Progress

| Step | Imports | Exports | State |
| --- | --- | --- | --- |
| Before | 30 | 129 | runtime `81b96f60…` |
| 1. Output devices in the kernel | 30 | 129 | verified, merged (`ff3a5c19`) |
| Before, on `bef23f6b` | 30 | 130 | runtime `8ce10189…`, 214,314 bytes |
| 2. Kernel exports instead of `FS` | 24 | 93 | verified (below), runtime `970172ca…`, 203,121 bytes |
| 4. Dolly-named imports, no generated JavaScript | 9 | 90 | verified (below), runtime `b97cb65a…`, 198,739 bytes |
| 3. Seed as a snapshot | 9 | 90 | verified (below), runtime `bfd733a4…`, 197,867 bytes, image inputs `cc0d47e5…` |

Step 1: `TerminalFile` in `src/file-blocks.cpp` is `/dev/dolly-stdout`,
`/dev/dolly-stderr` and `/dev/tty`, mounted when the root is populated;
`installOutputDevices` is gone. Like the JSImpl files they replace
(`js_impl_backend.h`), they are regular files of size zero, seekable, with
reads at end of file; `test -f /dev/tty` succeeds after the change (the
baseline was not probed). Counted again in Chrome: all six
`_wasmfs_jsimpl_*` imports 0 calls. Image inputs unchanged. Passed: `node --test test/*.test.mjs`, `npm run -s test:artifacts`,
and `core`, `boundary`, `host-modules`, `image`, `snapshot-stream`, `terminal`
and `process` browser suites in Chrome and Firefox
(`build/kernel-boundary-evidence/c1/summary.txt`).

## Step 2, verified (2026-10-06 night, `core/kernel-boundary-step2`)

`3a509e05` on `integrate/next` at `bef23f6b`: the earlier commit `a9a6ec42`,
cherry-picked without conflicts. The automatic merge left one break:
`src/runtime-worker.mjs` imported `../dist/dolly-errno.mjs`, which this base
no longer generates; the error numbers are in `src/process-constants.mjs`.
(The branch started on `7976b8ea`, which cannot build `system-build` from the
root: `Dollyfile-system-build:1659` ran `cd --help`; `fbfc278b` fixed that.)

What it is: `dolly_write_file` makes parent directories; `dolly_read_file`
(bounded, `-EFBIG` when larger) and `dolly_remove_file` are new exports in
`abi/dolly-supervisor-0.wat`; `/home/dolly` is made by the kernel;
`src/runtime-worker.mjs` and `host/snapshot/snapshot.mjs` use them
(`bootFiles`) and no longer touch `FS`; the seed's generated index runs
against five functions of the Worker; `-sFORCE_FILESYSTEM=1` and
`EXPORTED_RUNTIME_METHODS` are gone, and with them the six
`_wasmfs_jsimpl_*` imports.

Measured in `work/kboundary` (`build/kboundary-evidence/`):

- **Image inputs unchanged**: `e8e495dc…` before and after. 24 imports,
  93 exports (the 38 WasmFS exports and `emscripten_builtin_memalign` gone,
  two added).
- **Image bytes unchanged.** `system-build` from the root, fresh browser
  profile: digest A at `bef23f6b` with the base kernel and digest B with
  step 2 are both
  `e5a4ac8017581dcd45b005969f80a8cb5b8785b9975b3bebbfc5ed2d2f745a03`,
  137,050,593 bytes (`measure-ab.sh`, `measure-ab.log`). The `default` chain
  built cold with step 2 (12 images) and `system` have the digests of
  `work/next/dist`, built with the base kernel (`compare-next.sh`). So finding
  1 below is closed: with the sorted receipt the order in which seed
  directories are made no longer reaches an image.
- **It still costs four images.** `Dollyfile-dolly-docs` ships
  `abi/dolly-browser-0.wat` and `abi/dolly-supervisor-0.wat` by pin, so any
  change to the kernel's contracts repins it and the recipes that install it:
  `dolly-docs`, `pi`, `pi-local` and `dollyfile-studio` rebuild (`0183c6ee`).
  Steps 3 and 4 cost the same again, so they land together.
- **Suites**, on the merge of this branch with `integrate/next` at `38d3edf4`
  (`261a1fac`, runtime `970172ca…`, image inputs `e8e495dc…`, all 13 images
  reused): source 399 of 399; artifacts 23 passed, 1 skipped (CPython's, a
  demo image not built here), 0 failed; `core`, `boundary`, `host-modules`,
  `image`, `snapshot-stream`, `terminal`, `process` and `custom-session`
  8 of 8 in Chrome and 8 of 8 in Firefox (`step2-merged/summary.txt`).
- At `bef23f6b` itself `core`, `image`, `terminal`, `process` and the artifact
  suite fail with or without step 2, for reasons of that base (`cc` left
  `default`; `dolly-docs` missing from the artifact test's list; the
  interrupted-pipeline assertion). `integrate/next` fixed them in `40cb89ee`,
  `a34f0d38`, `1c0ae0e3`, `1dea294e` and `5f01cf1f`; `step2/summary.txt` and
  `work/next/build/next-evidence/browser-a/core-chromium.log` show the same
  failures.
- The merge with `integrate/next` conflicts in `src/runtime-worker.mjs`
  (`fix/page-ending` catches a failed ENTRY start) and in the pin lines.
  `core/kernel-boundary-step2-merged` holds the resolution that was tested:
  `runImageEntry` stays an async function over the kernel's bounded read, so
  an oversized `/etc/dolly/entry` is the image's ending with that message.


## Step 4, verified (2026-10-06 night, `core/kernel-boundary-step4`)

`a73a6bb9` on `7e39f6ee` (step 2 merged with `integrate/next` at `38d3edf4`).
The Worker instantiates `dist/dolly.wasm` itself; `host/modules.mjs` builds the
whole import object, each import from the provider of the module whose
manifest owns it. `dist/dolly.mjs` is no longer built, packaged or loaded,
and `globalThis.TextDecoder` is no longer replaced.

| | Imports | Exports | Bytes | Runtime |
| --- | --- | --- | --- | --- |
| Step 2 | 24 | 93 | 203,121 | `970172ca…` |
| Step 4 | 9 | 90 | 198,739 | `b97cb65a…` |

**The nine imports:** `env.memory`, `env.dolly_bootstrap_write_bytes`,
`env.dolly_clock_realtime`, `env.dolly_clock_monotonic`, `env.dolly_entropy`
(`runtime@0`), `env.dolly_http_dispatch`, `env.dolly_download_dispatch`,
`env.dolly_gpu_dispatch`, `env.dolly_audio_dispatch`. **The 90 exports:**
64 `dolly_*`, the 23 libc functions, `__stack_pointer` and
`__indirect_function_table` of `abi/dolly-kernel-plugin-0.wat`, and
`_initialize`, which `abi/dolly-supervisor-0.wat` now names. The artifact
test compares the kernel's exports with the contracts' names exactly.

Decisions, with their reasons:

- **No import for abort, memory growth or the environment** (the plan as
  changed by the measurement). Abort is a Wasm trap. Memory grows inside Wasm
  (`memory.grow`), by what is asked and no longer by Emscripten's 20 percent;
  trusted JavaScript already read `memory.buffer` at each use. The kernel sets
  its whole starting environment, in the order it had: `PATH`, `PWD=/`,
  `HOME`, `LANG`, `SHELL`, `TERM`, `COLORTERM`.
- **`LANG` is `en_US.UTF-8` for everyone.** It was the browser's language
  (`navigator.language`); headless Chrome and Firefox report `en-US`, so that
  is what every image was built with. A browser in another language now gets
  the same environment: a behaviour change, and one host datum less in the
  guest. An image that wants another value sets it with `ENV`.
- **Boot text returns a status.** `dolly_bootstrap_write_bytes` is
  `(i64 i64) -> i32`: the provider refuses a write beyond 1 MiB or outside
  kernel memory with `-EINVAL`, before copying.
  `dolly_terminal_write_bytes` returns it and the terminal device passes it
  to the writer, so a refused write is not a silent success. No genuine caller
  writes more: a process write is one packet (1 MiB).
- **Clocks are two imports without parameters**, each returning milliseconds
  as `f64` (`Date.now()`, `performance.now()` of the Worker, what processes
  already see); **entropy** fills at most 65,536 bytes a call. The kernel
  answers clock resolution itself and refuses the two CPU-time clocks
  (`EINVAL`), which Emscripten's glue answered with the monotonic clock; the
  kernel never asks for them.
- **`-sSUPPORT_LONGJMP=0`**: without it the link exports
  `_emscripten_stack_restore` and `emscripten_stack_get_current` for a
  JavaScript `longjmp` the kernel never uses.
- **Two private names of Emscripten.** `src/libc-host.c` defines
  `imported__wasi_fd_write` and `imported__wasi_fd_read`, the names
  `standalone.c` of Emscripten 6.0.8 imports WASI under. If an update renames
  them the WASI imports return and the build's exact import check fails.
- **One line of the old naming is left.** Host modules and the supervisor
  call exports as `dolly._NAME`; the Worker builds that object from the
  instance's exports in one line. The rename is
  `20261006-142127-kboundary-02`.

Measured in `work/kboundary` (`build/kboundary-evidence/`):

- **Image inputs unchanged** (`e8e495dc…`) and **image bytes unchanged**: the
  `default` chain and `system`, 13 images, rebuilt cold with the step 4
  runtime (snapshots, metadata and browser profiles removed first) have the
  digests they had, `system-build` from the root included (`e5a4ac80…`;
  `measure-cold.sh`, `measure-cold-step4.log`). No recipe pin of those images
  moves. The 13 builds took 717 s; the 12 of the chain took 846 s with
  step 2.
- **What repins**: the files `Dollyfile-dolly-docs` ships. Step 4 changes
  `abi/dolly-browser-0.wat`, `abi/dolly-supervisor-0.wat`,
  `docs/architecture.md`, `docs/browser-boundary.md` and `host/README.md`, so
  `dolly-docs`, `pi`, `pi-local` and `dollyfile-studio` rebuild (`d12751e9`);
  nothing else.
- **Packaging**: nothing names `dist/dolly.mjs` any more
  (`scripts/package-pages.sh`, `scripts/build.sh`, the tests). The release
  manifest lists the files a packaged site holds, and
  `coi-serviceworker.js` has no file list. A stale `dist/dolly.mjs` in an old
  tree is not packaged. `dist/dolly-seed.mjs` stays until step 3.
- **Growth and out-of-memory** (`probe-kernel-failures.mjs`, step 4, Chrome):
  a 2,047 MiB file is appended in 1.5 s; sizing a file to 9,000 MiB, past the
  kernel's 8 GiB, is refused with `ENOSPC` in about 50 ms, the shell goes on
  and a further 1 GiB file is written. The full `fs-growth` suite fills 8 GiB
  and is killed by the 6 GB browser cap with either runtime
  (`work/next/build/next-evidence/browser-d/`).
- **What the page reports when the kernel aborts** (the abort injected into
  the served Worker, the rest real; `step4/probe-failures-*.log`):
  during boot, the kernel's own line and `FATAL unreachable` in the boot log,
  status `failed`; inside a process's system call, the supervisor fails that
  process (`dolly: process N failed: unreachable`) and, when it is the ENTRY,
  the page's notice says "This image has ended: its program failed:
  unreachable"; in a Worker timer, outside any system call, the page stayed
  `ready` with no notice. That last case was silent before step 4 too (the
  page only disposed its modules on a Worker error); `89e78ca0` makes it a
  `FATAL` like the others and the boundary suite holds the check. The reason
  now reads `unreachable` where Emscripten's glue said `Aborted(...)`.
- **Suites** at `89e78ca0`: source 399 of 399; artifacts 22 passed, 1 skipped (CPython's), 0 failed;
  the eight browser suites 8 of 8 in Chrome and 8 of 8 in
  Firefox (`step4-final/summary.txt`). The boundary suite instantiates a
  kernel in the page from the providers and proves five things on it: a boot
  file at its bound is read and one byte more is refused
  (`/etc/dolly/entry is larger than 65536 bytes`); a boot text write of 1 MiB
  passes and one byte more is refused with `-EINVAL` without reaching the
  page; an allocation past 8 GiB fails and the kernel goes on; an abort traps
  after its reason reached the boot text. Each of the two done-when refusals
  and the Worker-failure check was seen to fail when broken on purpose.
- **Not measured**: an image larger than 209 MB. `python` and `cmake-build`
  in this tree were built for another seed (`22d006ca…`) and cannot be
  loaded by this runtime; `cmake-build` takes 28 minutes of the build slot.
  The largest loaded here: `system` (161 MB) by the streamed restore at every
  boot, `zig-build` (198 MB) restored as a base and `ghostty-build` (209 MB)
  captured during the cold chain. No demo suite and no GPU test ran.

For the merge: a branch whose kernel code uses `EM_JS`, `EM_ASM` or a
function of Emscripten's JavaScript library no longer links into an allowed
import; `npm run build:runtime` then fails at the exact import check. Such a
call becomes a typed import declared with `DOLLY_BROWSER_IMPORT`, owned by a
manifest and listed in `abi/dolly-browser-0.wat`.

## Step 3, verified (2026-10-06 night, `core/kernel-boundary-2`)

`a1a50e19` on `core/kernel-boundary-step4` (`c28cb1ee`), where it was
verified; rebased since as `97c34d4d`. The seed `dist/dolly.data` is a
Dolly snapshot (`abi/dolly-image-0.wat`, the format of every image), written
by `scripts/pack-seed.mjs` from the same staged files: 822 files under `/usr`,
126,817,748 bytes. The Worker stages it like a base image and
`dolly_process_bootstrap_prepare(size)` restores it in full, against the list
of its paths. Gone: Emscripten's file packager, its generated index
`dist/dolly-seed.mjs` (85 KB, the last generated JavaScript a page loaded),
the `/seed` staging tree and the kernel's copy of it into `/usr`
(`install_seed_tree`, 85 lines), and `/seed` in the session exclusions.

- Runtime `bfd733a4…`, 9 imports, 90 exports, 197,867 bytes. **Image inputs
  change** (`cc0d47e5…`; was `e8e495dc…`): the seed's bytes and the type of
  `dolly_process_bootstrap_prepare` in `abi/dolly-image-0.wat`. Every image
  is rebuilt.
- **Image bytes do not change.** The `default` chain built from the root
  with the snapshot seed, fresh browser profiles: all 12 snapshots are the
  bytes they were (`system-build` `e5a4ac80…` again). `system` differs in 5
  of 2,299 records, as it must: its recipe's pin and `/usr/bin/session-recover`,
  which compiles `src/session-records.h` (`chain-step3.sh`, `chain-step3.log`).
  The root rebuild of `system-build` the done-when asks for is this one.
- Seed files are now created with the mode every restored file has (0777; the
  copy made them 0666). No image records it.
- **What repins**: `Dollyfile-dolly-docs` (`abi/dolly-image-0.wat`,
  `docs/architecture.md`, `docs/browser-boundary.md`, `docs/sessions.md`) and
  `Dollyfile-system` (`src/session-records.h`), and with them every recipe
  built on `system` or installing the docs package (26 recipe files;
  that commit, `2950027d`, was dropped in the rebase for the integrator's repin).
- **Suites** at `2950027d`: source 399 of 399; artifacts 22 passed, 1 skipped
  (CPython's), 0 failed; `core`, `boundary`, `host-modules`, `image`,
  `snapshot-stream`, `terminal`, `process` and `custom-session` 8 of 8 in
  Chrome and 8 of 8 in Firefox (`step3/summary.txt`; its source line failed on
  one docs pin that an edit made during the run had left stale,
  `step3/source-repinned.log` is the run after the repin).

## Merging kernel code onto this kernel (from `fb6c3463` on)

No JavaScript is generated for the kernel (`-sSTANDALONE_WASM`). The gate is
`validate-browser`, at the end of `npm run build:runtime`.

- **A new import**: `DOLLY_BROWSER_IMPORT(dolly_NAME)` before a prototype
  (`src/process-kernel.h`), its typed line in `abi/dolly-browser-0.wat`, its
  name in the module's `module.json`, and the function in `bindings` of its
  `worker()`: addresses arrive as BigInt; return zero or a negative errno.
- **`EM_JS`, `EM_ASM`, Emscripten's JavaScript library and `setjmp`** link as
  imports nobody implements, and the gate fails (trial links,
  `trial2/p-*.wasm`). Trusted JavaScript has no `Module`, `HEAPU8` or `FS`:
  only the exports (`dolly._NAME`) and `memory.buffer`.
- **libc**: what it asks of a host is answered in `src/libc-host.c` (two
  clocks, entropy, no host environment, abort as a trap). Add a hook there,
  never an import. `emscripten_get_heap_max()` is the current size now.
- **Exports**: each must be a function of a manifest's contract WAT; the
  artifact test compares exactly. Boot and terminal writes return a status.

## Findings outside this task (2026-10-06)

A cold root rebuild of `system-build` with step 2
(`build/kernel-boundary-evidence/root-system-build-c2.log`) gave snapshot
`5adcf47c…`; the packaged one is `5ec9c0a8…`. Both have 136,948,619 bytes and
2,063 records, 2,062 of them identical. `/etc/dolly/artifact` differs: same
length (220,459), 27,463 bytes different inside its path lists.

1. **The image receipt follows `readdir` order.** `collect_paths`
   (`src/dollyfile.c:709-737`) appends a tree in enumeration order;
   `capture_export_members` (`src/dollyfile.c:795`, the call at line 803)
   fills an export's members with it, and `write_artifact_receipt` writes
   them as collected (`src/dollyfile.c:1018-1025`). Only the manifest is
   sorted (`src/dollyfile.c:1897,1922`). WasmFS enumerates a directory in creation
   order. Emscripten's seed loader made all 56 directories first; the Worker
   now makes one when its first file is written, so `/usr/include/X11` lists
   `extensions` after the `X*.h` files instead of before them. That the two
   receipts hold the same members is inferred from their equal length and
   equal count of path strings (3,598); the receipt was not parsed.
   The fix is `bac21512`, which sorts the members; a root rebuild of
   `system-build` with and without step 2 now gives one digest (above).
2. **Seed loading is not an image build input.** `src/runtime-worker.mjs`
   changed image bytes while `image inputs` stayed `2cc92c2b…`
   (`scripts/write-build-id.mjs:8-11` hashes the seed and four contracts).

3. **After a refused file growth, Chrome writes files about 15 times
   slower** (2026-10-06 night, `step4/growth-timing-*.log`). A 1 GiB append
   takes 0.6 to 0.9 s; after `ftruncate` to 9,000 MiB was refused with
   `ENOSPC` (the kernel's memory had grown to its 8 GiB maximum), the same
   append takes 9 to 13 s for the rest of the session. The same with step 2's
   runtime and Emscripten's glue; Firefox is not affected (1.3 s). Not
   investigated.

Step 1 was not rebuilt from the root on its own; it leaves seed loading
alone, so no change is expected there, but that is not measured.

## Done when

- The runtime Worker instantiates `dist/dolly.wasm` with imports that all come
  from `host/*/` providers; no generated JavaScript is loaded and
  `globalThis.TextDecoder` is never replaced.
- `abi/dolly-browser-0.wat` holds only Dolly-named imports, and the count is
  recorded here before and after.
- Every kernel export is named by a contract in `abi/` or `host/*/`, and the
  artifact test rejects any other.
- An oversized `/etc/dolly/entry` and an oversized boot text write are refused
  with explicit errors in a browser test (from `20260930-100000-audit-08` and
  `20260930-100000-audit-18`, merged here).
- Core, boundary, image, snapshot-stream and host-modules browser suites pass
  in Chrome and Firefox; a root rebuild of `system-build` succeeds.
