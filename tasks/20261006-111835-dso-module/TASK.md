# dso@0: the process's dynamic loader and FFI as a declared host module

- STATUS: OPEN
- PRIORITY: 318
- TAGS: core,architecture,host-modules,abi,boundary

Owner decision (2026-10-06 evening), on the recommendation in
`20261005-222449-spawn-users` (branch `investigate/spawn`): "I like the dso
thing." So the loader that lets a running program load another compiled module
into itself (`dlopen`, `dlsym`) and the FFI dispatcher (calls with a signature
known only at run time: libffi, Python's `ctypes`) become a host module an
image declares, `dso@0`, like `gpu@0` or `threads@0`.

## Measured (`investigate/spawn`, catalog of 61 images, `c12fd897`)

- Operations DSO 112-114 and FFI 120-123: 7 of the process contract's 55.
  `abi/dolly-process-dso-0.wat` is already its own contract.
- Served entirely in the process Worker, not the kernel: 1,028 lines of trusted
  JavaScript (`src/process-worker.mjs:78-412`, `src/process-ffi.mjs`), 36 KB of
  the 65 KB bundle every process Worker loads. No outer import.
- Four executables are real hosts, built `-rdynamic`: `nvim` (7 parsers),
  `python` (1 extension; the only FFI caller), `lua` (2 modules), `rustc-real`
  (proc macros). Ten recipes would declare the module; 51 images omit it,
  among them `default`, `minimal`, `system` and every game.
- Four more executables reach an operation without being hosts: `cmake`
  (`dlsym` only), `dolly-llama` and `pyrogenesis` (`dlopen` in images that
  hold no DSO for them), and `codex` (a thread client, where every DSO call
  already answers `ENOTSUP`). They must keep failing explicitly, not be
  admitted.
- The display plugin (`/usr/lib/libdisplay.so`) is not a user: the kernel
  links it at boot through its own contract (`abi/dolly-kernel-plugin-0.wat`).
- No start-up gain was measured or claimed. The gain is a smaller trusted
  surface for 51 images and an explicit line for the 10.

## Work

- `host/dso/`: manifest, contract (the existing DSO contract and the FFI
  packets, moved out of `process.h`), header, client, and the Worker-side
  loader and FFI as the module's provider, loaded by a process Worker only
  when the image declares `dso@0`.
- Admission: an executable built to host loadable modules (`cc -rdynamic`)
  is stamped as requiring `dso@0`, and the engine refuses an image that keeps
  one without declaring it, by the same rule as every other module. Decide the
  stamp by measurement, since link-time reachability and "is a host" differ
  (the four that only reach an operation).
- Without the module, `dlopen`, `dlsym` and FFI fail with `ENOSYS` and one
  line naming `dso@0`.
- The ten recipes declare it; `docs/browser-boundary.md` and `host/README.md`
  gain the row.

It changes the process contract (a new `dolly.process` digest; the Rust seed
rebuilds; every image rebuilds): land it in the next process-contract round
with `20261002-072000-input-host-module` and `20261006-093856-flock-stub`.

## Done when

- A process Worker of an image without `dso@0` loads neither the DSO loader
  nor the FFI dispatcher (measured bundle bytes before and after), and a
  program there that calls `dlopen` gets the explicit refusal.
- `python` (an extension and `ctypes`), `nvim` (a parser), `lua` and the Rust
  build pass their demo tests with the module declared.
- The catalog rebuilds and the source, artifact, browser and demo suites pass.

## Design (2026-10-06 night, `core/dso-module`, from `7976b8ea`)

### The stamp: linking a member of `libdolly-dso.a`

`host/dso/` has two client members, each with the `dso@0` record: `client.c`
(`dlopen`, `dlsym`, `dlerror`, `dlclose` as `dolly_dl*`, and
`__dolly_dso_allocate`) and `ffi.c` (`dolly_ffi_*`, the four FFI operations).

- A host: `cc -rdynamic` passes `--export=__dolly_dso_allocate` (today every
  link does), which extracts `client.o`. The Rust seed's link line does the
  same and gains `-ldolly-dso`.
- An FFI caller: by reference. Python's recipe builds and runs
  `/tmp/libffi-check`, a program that is not `-rdynamic`, so a stamp tied to
  `-rdynamic` alone would have refused FFI to it. libffi's Dolly backend calls
  `dolly_ffi_*` instead of raw operations.
- A program that only calls `dlopen` (`cmake`, `dolly-llama`, `pyrogenesis`,
  `codex`): the process libc (`libdolly-process.a`) defines `dolly_dl*` as weak
  refusals. That archive is linked whole, before any client archive is
  searched, so the names are already defined and a reference never extracts
  the client. They fail at the call and their images declare nothing.
- Enforced twice: the record is in the same object as the only code that
  issues the operations, and the process Worker serves them only to an
  executable that carries the record. An executable with both `threads@0` and
  `dso@0` is refused at admission (the loader is per Worker), which replaces
  the two `ENOTSUP` branches in the Worker.

Measured with the pinned `wasm-ld` on stand-ins for the three objects
(`build/dso-evidence/linker/`, `--trace-symbol`, `--why-extract`, `-Map`):

| Link | Extracted from `libdolly-dso.a` | `dolly_dlopen` kept | `dolly.host` |
| --- | --- | --- | --- |
| calls `dlopen`, no `-rdynamic` | nothing | the libc refusal | none |
| the same with `--export=__dolly_dso_allocate` | `client.o`, by `--export` | `client.o`'s | 72 bytes |
| calls `dolly_ffi_call`, no `-rdynamic` | `ffi.o`, by reference | the libc refusal | 72 bytes |
| refusals in a searched archive after `-ldolly-dso` (rejected) | `client.o`, by the `dlopen` reference | `client.o`'s | 72 bytes |

### Where the code lives

`host/dso/`: `module.json`, `dolly-dso-0.wat` (the DSO contract moved from
`abi/`, plus the operation numbers and limits as globals), `dso.h` (the DSO and
FFI packets moved out of `process.h`, the `dolly_dl*` declarations moved out of
`runtime.h`), `client.c`, `ffi.c`, `dso.mjs` (the module's Worker side),
`process.mjs` and `ffi.mjs` (the loader and FFI dispatcher moved out of
`src/`), `interface.mjs` (the DSO checks moved out of `src/process-abi.mjs`).

- A manifest may name `processWorker`: trusted JavaScript served inside the
  process Worker of an executable that requires the module. The bundler writes
  it as `dist/dolly-process-NAME.mjs` and refuses a process Worker bundle that
  contains any module's `processWorker` code.
- No round trip: the module's Worker side fetches its bundle and contract once
  at boot (starting a program stays free of requests, as `core` asserts) and
  registers them with the runtime; the supervisor, which already reads each
  executable's records for admission, puts the bundle into the `configure`
  message of exactly the executables that carry `dso@0`; that Worker imports
  it before `_start`. `src/` names no module: the hook is a
  list of process modules by requirement.

### Without the module

| Executable | Image | Result |
| --- | --- | --- |
| carries `dso@0` | declares it | served in its own Worker |
| carries `dso@0` | does not | refused before `_start`, status 126: `dolly: process N was refused: host module dso@0 is not declared by this image (REQUIRES HOST)`; sealing refuses to keep it |
| calls `dlopen`, no record | any | `NULL`, `errno` `ENOSYS`, `dlerror()` one line naming `dso@0` and `-rdynamic`; its Worker loads nothing |
| raw operation 112-114 or 120-123, no record | any | `-ENOSYS` from the kernel's unknown-operation path |

### Recipes

- By the stamp, the ten of the measurement: `python`, `nvim`, `neovim`,
  `neovim-build`, `rust`, `rust-build`, `rust-sdk`, `rust-tools`,
  `llvm-tablegen`, `dollyfile-studio`. Sealing names any other.
- `default`: `amy install python` (its start-up text), `nvim` and `rust` need
  it, by the rule that gave it `threads@0`. This postdates the measurement,
  which counted `default` among the 51.
- Not `system` or `cmake-build` (integrator's ruling, 21:20): an image
  declares a module because a program it keeps needs it or because it is
  meant to hold such programs, not for a test. A test that builds and runs a
  `-rdynamic` program states the module in its own recipe on top of the base:
  `test/dso-browser.mjs` (`system` plus `dso@0`), `displayProbe("cmake-build",
  "dso@0")` for the libuv probe. The smoke that `core` runs builds its probes
  without `-rdynamic`; before, every probe was a host.
- A build host enables `dso@0` beside `http@0` and `threads@0`: `ripgrep`,
  `fd` and `codex` build with `rustc-real` without keeping it.
- The hand-off changed after the design was sent: the supervisor posts the
  bundle as a `Blob` and the process Worker makes and revokes its own URL, so
  no URL of the runtime Worker has to be reachable from the Workers it starts.

## Evidence (`core/dso-module`)

Two bases, each with its own runtime and images; the second is the one that
counts. Logs and scratch files are in `build/dso-evidence/` (ignored).

### What every process Worker loads

`node scripts/bundle-process-worker.mjs` (esbuild 0.25.12, unminified, as
shipped), `wc -c` on the outputs; "before" is the same script and sources at
`7976b8ea` in a scratch copy.

| Bundle | Before | After | gzip -9 after |
| --- | --- | --- | --- |
| `dist/dolly-process-worker.mjs`, every process Worker | 65,304 | 9,112 | 2,935 |
| `dist/dolly-process-dso.mjs`, only a recording executable's Worker | | 58,557 | 13,716 |

- The task's estimate (36 KB of 65 KB) counted the loader and the FFI
  dispatcher. The Wasm parser, the record reader and the DSO checks were in
  the bundle only for them and left with them: 86% of what a Worker loaded.
- The bundler refuses a process Worker bundle with any input under a
  `processWorker` module's directory, so the split cannot silently close.

### The stamp, with the built sysroot

`build/dso-evidence/real-link/`: the pinned `wasm-ld` with the arguments
`cc` passes, on objects compiled from C sources against the published
sysroot (`--why-extract`, `-Map`).

| Program | `dolly.host` records | From `libdolly-dso.a` | `dolly_dlopen` is |
| --- | --- | --- | --- |
| calls `dlopen`, as `cc` links it | 0 | nothing | `libdolly-process.a(process-libc-adapter.o)` |
| the same, as `cc -rdynamic` | 1 | `process-dso-client.o`, by `--export (__dolly_dso_allocate)` | `libdolly-dso.a(process-dso-client.o)` |
| calls `dolly_ffi_call`, as `cc` | 1 | `process-dso-ffi.o`, by the reference | not linked |

### First base: `integrate/next` `6f118835` (image inputs `afca54ce…`)

Superseded by the second base below, kept because it is what ran first.

- Images: `DOLLY_IMAGE_JOBS=1 DOLLY_BUILD_IMAGES=default,system,cc,python
  work/slot.sh build npm run image`, 15 images in 17 min 50 s, exit 0. The
  Python build ran `/tmp/libffi-check` (an FFI caller that is not
  `-rdynamic`) and imported `dolly_extension_check…so` in the build host.
- By the stamp (`build/dso-evidence/scan-records.mjs`, every Wasm file of the
  15 snapshots): one file carries `dso@0`, `/usr/bin/python` (with `http@0`),
  in `python`. `default` (82 Wasm files) and `system` (101) hold none.
- Source: `node --test 'test/*.test.mjs' 'demos/**/*.test.mjs'`, 399 of 399.
- Without an image, the process Worker and the provider on a blank isolated
  page (`build/dso-evidence/worker-harness.mjs` running
  `test/fixtures/browser-process-abi.mjs`): Chrome and Firefox, 3 libraries
  loaded, 14 refused, a table-less executable answered `ENOSYS`.
- Browser suites, each `work/slot.sh browser node test/NAME-browser.mjs
  chromium firefox`, all passed in both: `host-modules` (10.7 s, 15.5 s),
  `dso` (38.4 s, 25.8 s), `core` (33.9 s, 45.5 s), `process` with its
  start-up block (20.8 s, 21.7 s), `threads` with its refusal (15.7 s,
  18.9 s), `boundary` (2.2 s, 3.5 s), `cpp` (15.8 s, 17.1 s).
- `npm run test:demos -- python`: passed in Chrome (36.8 s): `ctypes` with a
  `CFUNCTYPE` callback, pip, requests.
- `default` suite: failed at its first check, for a reason outside this
  change: the start-up text names `git`, and the subset built here had no
  `git` package, so the generated index lacked it. Not rerun on this base.
- Not run on this base: `amy`, the artifact suite, the Rust seed, `nvim`, Lua,
  the Rust images.

### Second base: `integrate/next` `fb6c3463` (image inputs `b03fae70…`)

The kernel without Emscripten's JavaScript runtime. The merge needed no
adaptation of the module: it adds no kernel code and no import. One conflict
in code, `host/runtime/runtime.mjs` (the process modules beside the new kernel
bindings). The recipe graph lint then named `cargo`, new on this base, which
installs `rust`: it declares `dso@0` (twelve recipes with `default`).

- `npm run build:runtime`: 1 min 37 s, exit 0, runtime `122fa1fb…`, image
  inputs `b03fae70…`; `validate-browser` passes with the nine imports.
- Source: 400 of 400. Lint: 67 recipes.
- Worker harness on a blank page: Chrome and Firefox, as on the first base.
- `node --test test/dolly.artifacts.mjs` before any image of this base: 14 of
  16; the two that read snapshots wait for the chain.
