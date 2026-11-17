# Go

Go built inside Dolly: Go's own toolchain (gc, Go 1.27.3), ported as `GOOS=dolly
GOARCH=wasm64`, rebuilds itself and its standard library here from the previous
round's build of it, the seed, and builds Go programs that run as Dolly commands.

## Images

- `go-sdk`: Go's GOROOT for dolly/wasm64: its patched source and the seed, the previous round's commands.
- `go-build`: the seed with the `go` package installed over it; the base of every Go build.
- `go-tools`: interactive shell: `system` with the `go` and `esbuild` packages.
- `go`: `go` and `gofmt`, the Go toolchain and standard library compiled again inside Dolly by the seed.
- `esbuild`: `esbuild`, the JavaScript and TypeScript bundler, built by `go`.

`npm run image -- go-tools` fetches the pinned seed from the GitHub release that carries it.

## The seed

The seed is Go's ten commands for dolly/wasm64 as the `go` package of the
previous round built them, with what `cmd/dist` generated for them, which Go's
source lacks: the runtime headers in `pkg/include` and six `z*.go` sources.
[`pin-seed.mjs`](pin-seed.mjs) archives and pins it in
[`source-pins.sh`](source-pins.sh) (`DOLLY_GO_SEED_*`), and the GitHub release
carries ([sources](../../docs/sources.md#the-rust-and-go-seeds)). Beside it,
`go-sdk` holds the GOROOT's sources: Go 1.27.3 with
[`go-1.27.3-dolly.patch`](go-1.27.3-dolly.patch), and the identities of the
process contract and `http@0` that the linker writes into executables
([`prepare-go-source.sh`](prepare-go-source.sh)), so a patch or contract
change reaches the build without a new seed. Go is written in Go, so the first
toolchain came from outside: [`build-go-toolchain.sh`](build-go-toolchain.sh)
cross-builds the same source with `make.bash` on Linux, with upstream's
linux/amd64 release of the same version as `GOROOT_BOOTSTRAP`, and writes its
commands in the seed's layout for a bootstrap from nothing (on 2026-11-17 the
pinned seed's bytes); rclone's staging lists its files with the `go` it leaves.

## Built inside Dolly

[`Dollyfile-go`](Dollyfile-go) runs the seed's `go install -a` on the
GOROOT's sources, with the flags of upstream's release build, over the seed:
every package of the standard library and of the ten commands upstream ships
is compiled in Dolly. Its commands are the next round's seed: a round that pins
the same bytes is the fixed point, where the toolchain the `go` package keeps
is the seed reproduced from source by itself. The seed taken from 0.1.7's
`go` package was, command for command, the cross-built seed it was built by.

## The port

- `GOARCH=wasm64` is Go's `wasm` on a 64-bit linear memory (memory64):
  addresses, the stack pointer and pointers passed to the host are i64. It is a
  member of the wasm family: the `wasm` build constraint and file suffix match it,
  as `linux` matches `android`, so every wasm file of the runtime and standard
  library applies. `GOARCH=wasm` builds the same code as upstream's, but for a
  fix of upstream's: a nil interface key in a map of more than one table read
  past the map's directory on wasm, which the rebuild here met
  ([task](../../tasks/20261023-230000-go/TASK.md)).
- `GOOS=dolly` calls the process contract
  ([`process.h`](../../include/dolly/process.h)) through its one import, and the
  linker writes the Dolly executable itself: the shared memory64 imported as
  `env.memory`, `_start`, and the `dolly.process` and `dolly.process.memory`
  sections. It is not `unix`: packages that need `//go:build unix` take their
  portable fallbacks, as on js and wasip1. Files, directories, the working
  directory, pipes, `dup`, locks and `os/exec` are the contract's own.

## Network, signals and exec

- `net/http`'s default transport makes requests through Dolly's HTTP broker
  (`http@0`), as `curl` does: the page fetches them under its policy, and the
  browser owns TLS, compression and redirects. CORS applies: `proxy.golang.org`
  and `sum.golang.org` send its headers, so `go get` works under the default
  policy. A program that links `net/http` records `http@0`, so an image that
  keeps one declares it. `net`'s sockets reach nothing, as on wasip1.
- `signal.Notify` receives the signals the kernel delivers (Ctrl-C, `kill`);
  one a program did not ask for takes its default action.
- `syscall.Exec` replaces the program (the contract's `EXEC`); signals the
  program ignored stay ignored.

## Limits

- Programs are pure Go: no cgo.
- A program is one thread and `runtime.NumCPU` is 1, so the go package sets
  `GOFLAGS=-p=4`, which halves a small module's first build. One compile of
  the toolchain's own `cmd/compile/internal/ssa` can grow to 3.9 GiB, so
  the go package's build compiles two at a time under `GOMEMLIMIT`.
- While the processes hold 4 GiB, a compile `go build` starts beside another
  running one waits until a process ends.

Test: `npm run test:demos -- go` ([`test/`](test/)).
