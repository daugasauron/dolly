# Go

Go's own toolchain (gc), ported to Dolly as `GOOS=dolly GOARCH=wasm64`. Work in progress:
[task](../../tasks/20261023-230000-go/TASK.md).

## The port

Go 1.27.3 with one patch, [`go-1.27.3-dolly.patch`](go-1.27.3-dolly.patch):

- `GOARCH=wasm64` is Go's `wasm` on a 64-bit linear memory (memory64): addresses, the stack
  pointer and the pointers a program passes to the host are i64. It is a member of the wasm
  family: the `wasm` build constraint and file suffix match it, as `linux` matches `android`, so
  every wasm file of the runtime and the standard library applies. `GOARCH=wasm` builds the same
  code as upstream's.
- `GOOS=dolly`: the linker writes a Dolly executable itself (the shared memory64 imported as
  `env.memory`, `_start`, the `dolly.process` and `dolly.process.memory` sections).
