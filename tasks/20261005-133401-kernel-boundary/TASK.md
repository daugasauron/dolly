# Own the kernel's outer boundary: load the kernel without Emscripten's JavaScript runtime

- STATUS: OPEN
- PRIORITY: 325
- TAGS: core,boundary,abi,architecture

From the big-picture review (`20261005-131642-big-picture`). `AGENTS.md` names
the kernel's outer imports and their trusted implementations as the security
perimeter and asks that authority decisions stay "short and directly
reviewable by a human". Every Dolly process is already a standalone Wasm
module that Dolly's own JavaScript instantiates with one import. The kernel is
the one module still instantiated by Emscripten's generated JavaScript, and
most of the perimeter is that generated code.

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
| 4, 3 | | | on `core/kernel-boundary-2` |

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

Not done in step 2: the two done-when tests and the exact-export test
(with step 4), steps 3 and 4.

## Step 4, measured before this round (trial links only, nothing in the tree)

- Emscripten's `standalone.o` cannot be kept out of a standalone link: with
  every other hook defined by the kernel, libc's `dup.o` still extracts it for
  its weak `__syscall_dup` (`why-extract-hooks.txt`). Its strong definitions
  then collide with any of the kernel's: `_abort_js`,
  `emscripten_get_heap_max`, `emscripten_resize_heap`, the eight preload
  queries and `_wasmfs_stdin_get_char` (`trial-hooks.log`).
- Untested design that follows: remove `_wasmfs_stdin_get_char` from
  `src/dolly.c`; define `imported__wasi_fd_read` (end of file) and
  `imported__wasi_fd_write` (boot text), the two names `standalone.c` imports
  WASI under; define `__wasi_clock_time_get`, `__wasi_clock_res_get`,
  `__wasi_random_get`, `__wasi_environ_sizes_get`, `__wasi_environ_get` and
  an empty `emscripten_notify_memory_growth`, as
  `src/process/libc-adapter.c` does for processes. If Emscripten renames the
  two private names, the WASI imports return and the exact import check
  fails the build.

## Step 4 as a trial link (2026-10-06, 21:10 JST; outside the tree, no browser run yet)

The sources are in `build/kboundary-evidence/trial2/tree` of `work/kboundary`
(the verified merge of step 2 plus the changes below), linked by
`trial2/trial.sh`; result `trial2/k-tree.wasm`, 198,696 bytes.

**9 imports, all Dolly-named:** `env.memory`,
`env.dolly_bootstrap_write_bytes`, `env.dolly_http_dispatch`,
`env.dolly_gpu_dispatch`, `env.dolly_audio_dispatch`,
`env.dolly_download_dispatch`, `env.dolly_clock_realtime`,
`env.dolly_clock_monotonic`, `env.dolly_entropy`.

**90 exports:** 64 `dolly_*`, the 23 libc functions, `__stack_pointer` and
`__indirect_function_table` of `abi/dolly-kernel-plugin-0.wat`, and
`_initialize` (the reactor's constructor call, to be named by
`abi/dolly-supervisor-0.wat`).

How:

- Link: `-sSTANDALONE_WASM=1 -sSUPPORT_LONGJMP=0`, output `dist/dolly.wasm`;
  no `MODULARIZE`, `EXPORT_ES6`, `EXPORT_NAME`, `ENVIRONMENT`,
  `DYNAMIC_EXECUTION` or `--js-library`. Without `SUPPORT_LONGJMP=0` the link
  also exports `_emscripten_stack_restore` and `emscripten_stack_get_current`
  (92 exports); the kernel never calls `setjmp`.
- The four dispatch imports and boot text are plain typed imports
  (`DOLLY_BROWSER_IMPORT` in `src/process-kernel.h`) instead of `EM_JS`.
- A new `src/libc-host.c` defines what Emscripten's libc and standalone
  runtime would import: `__wasi_clock_time_get`, `__wasi_clock_res_get`,
  `__wasi_random_get`, `__wasi_environ_sizes_get`, `__wasi_environ_get`,
  `emscripten_notify_memory_growth`, and `imported__wasi_fd_write` and
  `imported__wasi_fd_read`, the two names `standalone.c` imports WASI under.
  `_wasmfs_stdin_get_char` leaves `src/dolly.c` (the standalone runtime
  defines it over `imported__wasi_fd_read`), so no
  `--allow-multiple-definition` is needed.
- No import for abort (a Wasm trap), memory growth (`memory.grow` in Wasm;
  trusted JavaScript reads `memory.buffer` at each use) or the environment
  (the kernel sets its own). The eight preload imports are gone too:
  the standalone runtime answers them with zero.
- `dolly_bootstrap_write_bytes` returns a status so that a refused write is
  an error, not a silent success; `dolly_terminal_write_bytes` passes it on.

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
