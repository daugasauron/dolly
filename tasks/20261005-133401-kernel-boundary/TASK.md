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
- Steps 2 and 4 should keep images valid, like step 1: the kernel is no image
  build input, and new exports go to the supervisor contract. Each build has
  to print the same `image inputs` hash to prove it. Only step 3 changes
  `dolly.data` and `dolly-seed.mjs`. Until then the file packager's generated
  index runs against five functions of the Worker instead of Emscripten's
  module (as `test/dolly.artifacts.mjs` already loads it); the seed has no
  empty directory (56 directories, 822 files, checked).
- No abort, memory-growth or environment import is needed: abort is a Wasm
  trap, growth is `memory.grow` on the shared memory, and the kernel sets its
  own environment. The target is 9 imports: the memory, boot text, the four
  dispatches, two clocks and entropy.

## Progress

| Step | Imports | Exports | State |
| --- | --- | --- | --- |
| Before | 30 | 129 | runtime `81b96f60…` |
| 1. Output devices in the kernel | 30 | 129 | verified, see below |

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
