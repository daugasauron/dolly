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
  executable's records for admission, puts the bundle's blob URL into the
  `configure` message of exactly the executables that carry `dso@0`; that
  Worker imports it before `_start`. `src/` names no module: the hook is a
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
- `system` and `cmake-build`: their suites build hosts with `cc -rdynamic` and
  run them there (`core`'s smoke builds every probe that way; `cmake`'s libuv
  probe). A toolchain whose compiler builds hosts declares the module to run
  them. Flip this by removing one line and moving those cases to a composed
  image if `system` should stay without it.
- A build host enables `dso@0` beside `http@0` and `threads@0`: `ripgrep`,
  `fd` and `codex` build with `rustc-real` without keeping it.
