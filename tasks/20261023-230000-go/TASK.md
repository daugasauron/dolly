# Go built inside Dolly, bootstrapped as Rust is

- STATUS: OPEN
- PRIORITY: 200
- TAGS: toolchain,go,bootstrap,0.1.4

Owner (2026-10-23): "one that tries to bootstrap go properly (similar to rus)". Route and
reasons: [the languages investigation](../20261023-200001-languages/investigation.md),
section 2, route A: Go's own toolchain (gc) with a new `GOOS=dolly GOARCH=wasm64`. Go's wasm
backend narrows every address to 32 bits and its linker defines its own memory; Dolly is
memory64 with an imported shared memory and its own executable sections (`src/compiler.cpp`
says what `cc` stamps). Upstream adds wasm32, not memory64, so this is a fork of Go's tree
carried as patches, like `demos/rust`'s.

Bootstrap, as `demos/rust`: stage 0 is the patched tree cross-built on the host
(`GOOS=dolly GOARCH=wasm64`), recorded as the bootstrap exception; stage 1 is the toolchain
rebuilt inside Dolly from that seed, and compared with it.

First step: memory64 in the backend and linker alone, proven on the host before any Dolly
code. TinyGo, gollvm and gccgo are not paths (investigation, routes B to D).

Done when: in a Dolly session `go build` makes a program that runs as a command; the
toolchain rebuilt inside Dolly equals its seed (or the difference is understood and
recorded); `gofmt` and one pure-Go tool agents use run; a browser test proves it in
Chromium and Firefox; `demos/go/README.md` names the bootstrap exception and the patches.
Each step's measurements are recorded here as they are made.

## State (2026-10-23)

Steps 1 to 3 done: memory64 as `GOARCH=wasm64`, proven on the host; `GOOS=dolly` on the
process contract; the seed (`demos/go/build-go-toolchain.sh`) runs in a Dolly session, where
`go build` makes a program that runs, in Chrome and Firefox (below). Next: the go-sdk and
go-build recipes, the toolchain rebuilt inside Dolly and compared with the seed. The fork is one patch,
[`demos/go/go-1.27.3-dolly.patch`](../../demos/go/go-1.27.3-dolly.patch), against Go 1.27.3.

## Decisions

- **Go 1.27.3** (released 2026-10-19), the newest on go.dev on 2026-10-23; the host bootstrap is
  upstream's go1.27.3 linux/amd64 archive. Both pinned by sha256 in `config/source-pins.sh`.
- **`GOARCH=wasm64`, a member of the wasm family.** The machine (memory64: i64 addresses, an i64
  SP, i64 pointers to the host) is the arch; the process contract is the GOOS, as AGENTS.md keeps
  the machine ABI and the substrate apart. Go's `wasm` already has 8-byte pointers and registers,
  so nothing else differs. To keep the fork small, wasm64 satisfies the `wasm` build constraint and
  file suffix, as `android` satisfies `linux` (go/build, cmd/go's imports and modindex, cmd/dist),
  and `goarch.IsWasm` is 1 on wasm64: every `_wasm.go`/`_wasm.s` file and every wasm decision of
  the runtime applies unchanged. Only `heapAddrBits` differs (34: the 16 GiB browsers give a
  memory64).
- **One switch in each place that addresses memory.** `cmd/internal/obj/wasm` (`addressingOf`) and
  `cmd/compile/internal/wasm` (`getAddress`, `sizeConst`) drop the `I32WrapI64` before loads,
  stores and `memory.copy/fill`, use i64 SP arithmetic, and pass `uintptr`/pointers to imports as
  i64; the linker types SP and `WasmPtr` by the arch and writes `i64.const` segment offsets. The
  runtime's hand-written assembly says the same through `runtime/asm_wasm.h` (`WrapAddress`,
  `ExtendSP`, `SPConst`, `SPAdd`, `SPSub`), installed in `pkg/include` like `asm_amd64.h`.
  `internal/bytealg`'s emscripten-compiled `memchr`/`memcmp` do 32-bit pointer arithmetic; wasm64
  takes the generic Go `IndexByte` and `Compare` instead of porting them.
- **No `wasip1/wasm64` port.** WASI preview 1 is 32-bit (Go's wasip1 passes `uintptr32` in its
  iovecs); it served only as the host proof below and is not in the patch.
- **The linker writes the Dolly executable itself** (GOOS=dolly): `env.memory` imported shared,
  memory64, maximum 131072 pages, `_start`, and the `dolly.process` (the ABI digest) and
  `dolly.process.memory` sections as `cc` stamps them (`cmd/link/internal/wasm/dolly.go`). The
  digest is `zdolly.go`, written from `DOLLY_PROCESS_ABI_DIGEST` by the seed build, not part of
  the patch, so a contract change rebuilds the toolchain as it rebuilds `cc`.

## Step 1: memory64 on the host (2026-10-23, measured)

The patched toolchain builds on the host in 50 s (`make.bash`). A program built
`GOOS=wasip1 GOARCH=wasm64 -ldflags=-E=_rt0_wasm_wasip1` and run in Node 22.22.2
(`--experimental-wasm-memory64`) under a 90-line JS stand-in for the ten WASI calls (i64 pointers):

- validates in V8 as a memory64 module; hello, 200 binary trees (12 GC cycles), 50 goroutines
  over a channel, a 1 GiB slice: correct.
- eleven 512 MiB slices: highest address 0x1609fffff, above 4 GiB; contents correct.
- `go test -c` of 26 packages (strings, strconv, bytes, sort, math, math/big, unicode/utf8,
  regexp, encoding/json, reflect, sync, crypto/sha256, hash/crc32, compress/flate, fmt,
  container/heap, slices, maps, errors, time, runtime/debug, encoding/binary, bufio, unicode,
  go/parser, go/printer, text/template) with `-test.run=^Test -test.short`: every test passes but
  those that need files (the stand-in has none: testdata, temp dirs, zoneinfo). One bug found
  and fixed this way: `CALLFN` loaded the uint32 `stackArgsSize` with `I64Load` and relied on the
  wrap to drop `stackRetOffset` (reflect calls failed out of bounds).
- `GOARCH=wasm` is unchanged: the same program's code section is byte-identical between the
  patched and the upstream toolchain (data differ in 6 bytes: line tables of the edited files).

## Step 2: GOOS=dolly (2026-10-23, measured)

- `GOOS=dolly GOARCH=wasm64 go build std` and `go build cmd` succeed. Every toolchain binary passes
  Dolly's own admission check (`src/process-abi.mjs`): exactly `env.memory` (shared, i64,
  maximum 131072 pages) and `dolly_process_0.call` imported, `_start` exported, `dolly.process`
  and `dolly.process.memory` sections. Sizes: compile 57.7 MB, go 33.7 MB, link 13.5 MB,
  asm 10.1 MB, cgo 7.8 MB, gofmt 5.5 MB; initial memory 310 pages (compile) down to 35 (hello).
- In a `system` session in Chrome: a program printing, filling a 100,000-key map and passing a
  value between goroutines, and one using `fmt` and `os` (arguments, `Getwd`, `WriteFile`,
  `ReadFile`, `ReadDir` with modes and sizes, environment, pid) print what they print on Linux.
- Design: dolly is not `unix` (no `unix` build tag), like js and wasip1, so packages with
  `//go:build unix` (golang.org/x/sys/unix, x/term) take their portable fallbacks. In std it
  follows wasip1 where wasip1 is generic (80 build constraints say `wasip1 || dolly`; the
  network is wasip1's fake one), and the unix code of js where Dolly has the real operation:
  descriptors with dup and close-on-exec, a working directory and `*at` paths, pipes,
  `os/exec` with `LookPath`, `os.Executable` through `/proc/self/exe`. The syscall package is
  unix-shaped (`Stat_t` with `S_IF*` modes, `ReadDirent`, `Dup2`, `Pipe2`, `StartProcess`,
  `Wait4`) over packets of the contract (`syscall/*_dolly.go`); `runtime/os_dolly.go` holds the
  one `go:wasmimport` and pushes it to syscall. Signals: a call interrupted by one takes it
  (INTERRUPT_POLL), ignores SIGCHLD and SIGWINCH and otherwise exits with the signal; Go's
  `os/signal` delivers nothing (as on wasip1, `_NSIG` is 0 for all wasm).
- `Wait4` polls (WAIT with NONBLOCK, sleeping 0.1 to 10 ms) instead of blocking the process,
  so that goroutines copying a child's output keep running: a blocking WAIT would stop the
  whole single-threaded runtime while the child waits on a full pipe.

## Step 3: the seed in a session (2026-10-23, measured)

- `demos/go/build-go-toolchain.sh`: the pinned source with the patch, `GOOS=dolly GOARCH=wasm64
  ./make.bash` with upstream's linux/amd64 go1.27.3 as `GOROOT_BOOTSTRAP` (1 min 42 s, 7 min
  CPU), packaged as `go/` (sources, `lib`, `pkg/include`, `pkg/tool/dolly_wasm64`, and the
  dolly `go` and `gofmt` in `bin`): 74.6 MB gzipped, 332 MB unpacked (src 163 MB of which
  testdata 33 MB, tools 131 MB, bin 38 MB). ustar, because Dolly's `tar` reads no GNU long
  names.
- In a `system` session, extracted to `/usr/lib/go` (13.7 s Chrome, 26.0 s Firefox):
  `go version` says `go1.27.3 dolly/wasm64`; `go env` finds GOROOT through `/proc/self/exe`;
  `gofmt -d` works; `go build` of a fmt hello world compiles runtime, fmt and their imports from
  source and links a program that runs: 33.0 s in Chrome, 29.7 s in Firefox; the second build,
  from the cache, 0.71 s. `go build` locks its cache: `syscall.Flock` over FD_LOCK (whole-file
  description locks), polling like `Wait4` when it must wait.
- A probe of `os/exec` (captured output, 1 MiB through `cat` both ways, exit status,
  `LookPath`), `os.Pipe` between goroutines, timers and `os.Executable` passes in both browsers.

## Step 4, first runs: an upstream map bug (2026-10-23, measured)

- The seed's `go install -a` of the toolchain in a session (Chrome, `-p 4`) failed after 190 s:
  `compile` of `cmd/compile/internal/ssagen` trapped (memory access out of bounds) in
  `runtime.mapaccess2` from `ssa.cse`; browser peak 4.4 GB of the 6 GB slot.
- Reproduced on the host in 6 s by running the dolly `compile` under Node with a 120-line stand-in
  for the contract's file operations (`build/go-evidence/tools/dolly-host.mjs`, a debugging aid
  outside the repository), then in 13 lines: a `map[any]int` of 2,000 entries and `m[nil]`.
  **Upstream Go 1.27.3 crashes the same way on GOARCH=wasm** (js/wasm and wasip1/wasm, measured):
  wasm hashes are 32-bit, but `interhash` returns the map's 64-bit seed for a nil interface,
  and `directoryIndex` shifts it by `32 - depth`, indexing far past the directory once a map
  has more than one table. wasm32 wraps the address, wasm64 does not; both trap. Fixed in the
  patch where the index is taken (`internal/runtime/maps/map.go`); worth reporting upstream.
  So `GOARCH=wasm` builds upstream's code except `directoryIndex`.
- With the fix, the dolly `compile` (wasm64, in Node) compiles ssagen in 17 s, byte for byte
  the archive the linux/amd64 `compile` of the same source writes with the same arguments.
