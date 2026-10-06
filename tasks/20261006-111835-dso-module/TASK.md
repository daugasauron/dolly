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
