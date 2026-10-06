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
`7976b8ea` in a scratch copy. The same bytes on both bases.

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
- Images: `DOLLY_IMAGE_JOBS=1 DOLLY_BUILD_IMAGES=default,system,cc,python,git
  work/slot.sh build npm run image`: 16 images, 17 min 18 s of building
  (39 min 39 s with the wait for the slot), exit 0. `git` is built so that
  the index holds every package `default`'s start-up text names.
- By the stamp, the 16 snapshots again: only `/usr/bin/python` carries
  `dso@0`; `default` (82 Wasm files) and `system` (101) hold none.
- `node --test test/dolly.artifacts.mjs`: 16 of 16.
- Browser suites in Chrome and Firefox, all passed in both:
  `host-modules` (7.9 s, 8.6 s), `dso` (16.4 s, 19.6 s), `core` (26.0 s,
  33.4 s), `process` with its start-up block (19.4 s, 19.5 s), `threads` with
  its refusal (10.4 s, 11.2 s), `boundary` (1.9 s, 2.6 s), `default` with its
  composed toolchain (0.9 s, 1.5 s; 6.3 s, 6.7 s), `cpp` (10.6 s, 10.7 s).
- `amy`: its first block passed in both (4.7 s, 5.3 s): `amy install python`
  into `default` in 0.8 s, `python3` runs, the saved session restores it. Its
  second block stops at `amy install cmake`, a package not built here.
- `npm run test:demos -- python`: passed in Chrome (20.6 s).

What each suite shows of this task:

| Claim | Where |
| --- | --- |
| A program that calls `dlopen` in an image without `dso@0` gets `NULL`, `ENOSYS` and one `dlerror` line naming the module; the raw operations 112-123 are `ENOSYS` | `host-modules` |
| A host (`cc -rdynamic`) and an FFI caller carry the record, and that image refuses both with the one line, status 126 | `host-modules` |
| That page never requests `dist/dolly-process-dso.mjs`; a page that declares the module requests it once at boot and no program requests it again | `host-modules`, `dso` |
| With the module: C and C++ hosts load libraries, a library exits its owner, a library recording an undeclared module is refused before its constructors, FFI packets are bounded and a call reaches its target | `dso` |
| A program without the record is served nothing in an image that declares the module | `dso` |
| `threads@0` with `dso@0` in one executable is refused, naming `dso@0` | `dso` |
| Under threads `dlopen` is the libc refusal; `cc -pthread -rdynamic` does not link | `threads` |
| `default` declares the module and `amy install python` works there | `default`, `amy` |
| CPython: an extension module at build time, `ctypes` with a callback at run time | the `python` build, its demo test |

### The Rust seed and what else the catalog depends on (second base)

- `demos/rust/build-rust-toolchain.sh` on the build tree the integrator
  copied in (inside `systemd-run … MemoryMax=8G`): 5 min 8 s, exit 0, "built
  and validated the complete Rust compiler seed". `link.sh` links
  `-ldolly-dso` and compiles `dlopen.c` against `build/include`.
- The relinked `rustc.wasm` (`rustc-real`) carries one record, `dso@0` with the
  current digest, and exports `__dolly_dso_allocate` and `dolly_dlopen` among
  5,227 symbols: what the sealing rule expects of the Rust images.
- Images, with the integrator's leave, through the build slot
  (`DOLLY_IMAGE_JOBS=1`): `cmake-build` (24 min 17 s), `neovim-build`
  (3 min 38 s), `nvim`, `neovim`, `rust-sdk`, `rust-build`, `ripgrep` (60 s),
  then `rust` and `rust-tools`: 25 images in the tree, every build exit 0.
  - `neovim-build` builds `lua` with `-rdynamic`, loads a C module with
    `package.loadlib` and `lpeg` with `require`, and runs Neovim's parser
    check, all in the build host.
  - `cmake` (one of the four that only reach an operation) built itself and
    ran its installs with libc's refusal behind `dlsym`; `cmake-build` was
    sealed without declaring the module.
- By the stamp, all 25 snapshots (`build/dso-evidence/scan-records-4.txt`):

  | Executable | Images that keep it, all declaring `dso@0` |
  | --- | --- |
  | `/usr/bin/nvim` | `nvim`, `neovim`, `neovim-build` |
  | `/usr/bin/lua` | `neovim-build` |
  | `/usr/bin/python` (with `http@0`) | `python` |
  | `/opt/rust-sdk/bin/rustc-real` | `rust`, `rust-sdk`, `rust-build`, `rust-tools` |

  No other Wasm file carries the record: not `cmake`, not `rg`. `default`
  declares the module and keeps no carrier. No image keeps a carrier without
  declaring, which sealing enforces.
- `node --test test/dolly.artifacts.mjs` on the 25 images: 16 of 16.
- `npm run test:demos -- cmake`: passed in Chrome (18.7 s). Its recipe adds
  `dso@0` to `cmake-build` for the libuv host it builds and runs.
- `npm run test:demos -- neovim`: passed in Chrome (6.9 s), first run.
- `rg` (`build/dso-evidence/rg-once.mjs`): `amy install ripgrep` into
  `default`, `rg --version` prints `ripgrep 15.1.0`, a search finds its file:
  Chrome and Firefox.
- The Rust demo test's compiler half on `rust-tools`
  (`build/dso-evidence/rust-macro.mjs` running `runRustTools`): `rustc`
  builds a proc macro, `rustc-real` loads it, the macro starts `/bin/slop`
  while it expands; threads; a Patti build and its resume: Chrome (14.1 s)
  and Firefox (17.6 s). Its Tokio half was not run (it needs the Codex
  sources).

### Not run

- `llvm-tablegen`, `dollyfile-studio`, `cargo` and every other image of the
  catalog; the full `amy` suite (its second block installs `cmake`, `sdl2`,
  `rust`, `codex-cli`); the Tokio half of the Rust demo test; the release
  acceptance and packaging.
- Recipe pins are not committed: `node scripts/update-recipe-pins.mjs` makes
  a checkout of this branch lint, as the integrator's re-pin does.

## State (2026-10-07 00:35, `core/dso-module`)

Done and verified on `fb6c3463`: the module, its tests and documents, twelve
recipes. The first two done-when criteria hold as measured above. The third
is the catalog round's: build every image (sealing names any recipe that
keeps `nvim`, `lua`, `python` or `rustc-real` without the line), then the
full `amy` and demo suites. The task stays open until that round has run;
the branch joins `integrate/round3`.
