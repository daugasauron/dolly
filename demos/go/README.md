# Go

Go built inside Dolly: Go's own toolchain (gc, Go 1.27.3), ported as `GOOS=dolly
GOARCH=wasm64`, rebuilds itself and its standard library here from a seed built
outside, and builds Go programs that run as Dolly commands.

## Images

- `go-sdk`: the seed, staged: Go's GOROOT for dolly/wasm64, cross-built outside Dolly.
- `go-build`: the toolchain and standard library compiled again inside Dolly by the seed; the base of every Go build.
- `go-tools`: interactive shell: `system` with the `go` and `esbuild` packages.
- `go`: `go` and `gofmt`, the Go toolchain built inside Dolly.
- `esbuild`: `esbuild`, the JavaScript and TypeScript bundler, built by `go`.

Build the seed once with `./demos/go/build-go-toolchain.sh` (Linux x86_64, curl, patch,
Node), then `npm run image -- go-tools`.

## The seed

Go 1.27.3 with [`go-1.27.3-dolly.patch`](go-1.27.3-dolly.patch) is a bootstrap
exception: [`build-go-toolchain.sh`](build-go-toolchain.sh) cross-builds it with
`make.bash` (`GOOS=dolly GOARCH=wasm64`) on Linux, with upstream's linux/amd64
release of the same version as `GOROOT_BOOTSTRAP`, both pinned in
[`source-pins.sh`](../../config/source-pins.sh), and packages the GOROOT: the
sources, the tools for dolly/wasm64 and its `go` and `gofmt`. Go is written in Go,
so the first toolchain that runs here is built elsewhere; the seed is that and
nothing more ([below](#built-inside-dolly)). It names the process contract it
was built for (`DOLLY_PROCESS_ABI_DIGEST`), so a change of the contract rebuilds it.

## Built inside Dolly

[`Dollyfile-go-build`](Dollyfile-go-build) runs the seed's `go install -a` on the
seed's sources, with the flags of upstream's release build, over the seed: every
package of the standard library and of the ten commands upstream ships is
compiled in Dolly. The build fails unless each command is byte for byte the
seed's, so the toolchain the `go` package keeps is the seed reproduced from
source by itself.

## The port

- `GOARCH=wasm64` is Go's `wasm` on a 64-bit linear memory (memory64):
  addresses, the stack pointer and pointers passed to the host are i64. It is a
  member of the wasm family: the `wasm` build constraint and file suffix match it,
  as `linux` matches `android`, so every wasm file of the runtime and standard
  library applies. `GOARCH=wasm` builds the same code as upstream's.
- `GOOS=dolly` calls the process contract
  ([`process.h`](../../include/dolly/process.h)) through its one import, and the
  linker writes the Dolly executable itself: the shared memory64 imported as
  `env.memory`, `_start`, and the `dolly.process` and `dolly.process.memory`
  sections. It is not `unix`: packages that need `//go:build unix` take their
  portable fallbacks, as on js and wasip1. Files, directories, the working
  directory, pipes, `dup`, locks and `os/exec` are the contract's own.

## Limits

- Programs are pure Go: no cgo.
- A program is one thread: `runtime.NumCPU` is 1, so `go build` compiles one
  package at a time unless told `-p N`.
- No network: `net` reaches nothing, so modules come from a vendor directory.
- `os/signal` delivers nothing; a signal takes its default action.
- `syscall.Exec` fails (`ENOSYS`); `go run` starts the program as a child.

Test: `npm run test:demos -- go` ([`test/`](test/)).
