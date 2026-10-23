# More languages in Dolly: Go, OCaml and the rest (investigation, 2026-10-23)

Owner: "Are there any other languages that can be added? go?" and "OCaml would also be cool."

Read-only. Nothing was built, so no new number here is a measurement of a candidate; the numbers are Dolly's own, from task records. Each claim is marked: **[read]** read in this repository or in upstream source; **[measured]** a number recorded in `tasks/` or a demo README; **[web]** a read-only web query made today; **[inferred]** my reasoning, not verified.

## 1. What Dolly gives a language runtime, and what it does not

These are the facts every estimate below rests on [read: `AGENTS.md`, `docs/process-model.md`, `docs/sources.md`, `docs/browser-stack.md`, `src/process/*.c`, `src/compiler.cpp`].

- **Processes.** No `fork`, no `exec`. `posix_spawn` with `adddup2`; `system()` and `popen()` spawn `/bin/slop -c` (`src/process/runtime-adapter.c:567`). Every interpreter's `system`/backticks therefore work unchanged; every `fork`-based `spawn` must be routed to `posix_spawn`. `#!` lines name an in-Wasm interpreter (nested at most 4), so bytecode programs with a `#!/usr/bin/ocamlrun` header run as commands.
- **Threads.** `threads@0`: `-pthread` statically linked programs, 16 threads per process, 64 in total, 4 "processors". Without `-pthread` the libc is Emscripten's single-threaded one with weak pthread stubs (`src/process/pthread-stubs.c`): mutexes and condvars link and do nothing; `pthread_create` fails. **`-pthread` and `-rdynamic` (dso@0 hosts) are mutually exclusive** (`compiler.cpp:1662`); rustc chose dso@0 and so has no threads.
- **Signals.** Ten signals, delivered only at syscall boundaries; no `SIGSEGV`, `SIGUSR*`, `SIGPROF`, no `sigaltstack`, `ITIMER_REAL` only. A runtime that uses `SIGSEGV` for null checks or guard pages, `SIGUSR` to stop threads, or `ITIMER_PROF` for time limits must have those paths turned off.
- **Memory.** `mmap` is a private copy: an anonymous mapping is `posix_memalign` plus `memset`, so a `PROT_NONE` "reservation" is committed and zeroed at once; `MAP_FIXED` is refused with `ENOTSUP` (`src/process/mmap.c:119`); `mprotect` is Emscripten's stub that returns success and changes nothing [web: `emscripten_syscall_stubs.c`, "let's not and say we did"]. A process has at most 8 GiB. No page can trap. Nothing can execute generated code: **no JIT, ever**, and no nested WebAssembly.
- **Stacks.** C's data stack is 8 MiB in linear memory, but every Wasm call also takes a frame on the browser's stack: 500 KB in a Chrome Worker (about 2,766 nested probe calls), 950 KB through `WebAssembly.promising`, which only an executable carrying a `dolly.process.stack` section gets [measured]. Deep recursion (compilers, interpreters' recursive descent on `-O0`) meets this first.
- **Conservative GCs and Wasm locals.** A collector that scans the C stack cannot see values the compiler keeps in Wasm locals. Emacs is built at `-O0` for exactly this reason and an `-O2` build crashes [measured: `demos/emacs/README.md`]. Ruby's upstream Wasm port solves the same problem with Binaryen's Asyncify instead [web]. Dolly has `wasm-opt` as a package (`demos/tools/Dollyfile-binaryen`); whether its Asyncify pass handles memory64 is **unverified** (nothing found).
- **setjmp/longjmp and C++ exceptions** work through Wasm EH (`-fwasm-exceptions -sSUPPORT_LONGJMP=wasm`, `toolchain/CMakeLists.txt:133`); interpreters built on `longjmp` (OCaml, Perl, Tcl, Guile, Gambit, Emacs) need no Asyncify for that.
- **configure scripts.** Slop runs autoconf's shell now, but inside Dolly configure still stops at `chmod`, `test -x` and above all `config.sub`, which cannot name Dolly; Make's configure would also start about 4,700 Workers for `test` and `printf` [measured: `tasks/20261006-121403-configure-survey`]. The settled pattern is either a recipe that states what configure would find (`demos/tools`, `tmux`, `x11`) or configure run in the pinned Emscripten container at preparation, with every object compiled in Dolly (CPython, Emacs, zsh: `demos/python/prepare-cpython.sh`). Autoconf-based interpreters (OCaml, Perl's own `Configure`, Tcl, PHP, Ruby) take the second route and record it as a bootstrap exception.
- **Linking.** Only `cc` knows how to make a Dolly executable: it links with LLD, then appends the `dolly.process`, `dolly.process.memory` and `dolly.host` custom sections and validates the single import `dolly_process_0.call (i32,i64,i64,i64,i64)->i64` and the shared memory64 import (`compiler.cpp:1296-1560`). A language with its own linker (Go) must either emit those sections itself or hand the final link to `cc` (Zig does; Rust does through `rust-linker.c`).
- **Network.** Only `env.dolly_http_dispatch`; `AF_INET` fails with `EAFNOSUPPORT`. A package manager's registry needs CORS or a relay (crates.io's index needed one), and a language's own HTTP client needs a transport like CPython's `_dolly_http` unless it sits on libcurl.

### How a language came in so far (the cost scale)

| Language | Stage 0 | Built inside Dolly | Measured cost |
| --- | --- | --- | --- |
| C/C++ | host-built seed compiler (LLVM 24 in a container) | LLVM, Clang, LLD again by `cc`: byte-identical compiler | 2,559 units, about 50 min, 7 GB [measured] |
| Rust | host-cross-built rustc 1.98.1, std and a Cargo object (77 MB seed) | rustc twice (second equals third), std, Cargo; every Rust crate in the packages compiled in Dolly | rust-llvm 1,455 s; rustc 8–9 min per generation; Cargo 9 min; a Cargo tool 68–87 s [measured] |
| Zig | upstream's `zig1.wasm` run by WAMR built with `cc` (no host build) | zig2.c (64 MB) by zig1 in about 4.3 min, `cc -O2` 104 s; LLVM 21 in 75 min for the LLVM backend | [measured] |
| Mojo | none (C++ compiler on LLVM/MLIR) | LLVM+MLIR 45–77 min, compiler 13 min, 6.2 GB | [measured] |
| CPython, QuickJS, Lua | none (C) | configure in container (CPython), objects in Dolly | hours of recipe work, a 240-line patch (CPython) [read] |

The pattern a new language follows: a demo under `demos/NAME/` with pinned sources in `config/source-pins.sh`, a `prepare-sources.sh` hook, one `Dollyfile` per package built `FROM tools-build` or `cmake-build` (the jq recipe is the template: `SOURCE` pinned tar, a Makefile in the recipe, a one-line test, `EXPORTS TOOL`, a man page), a browser test, and a README naming the bootstrap exception if any.

## 2. Go

### Why there is no Go today [read: Go `master`; web]

- Go's gc toolchain has one WebAssembly architecture, `GOARCH=wasm`, defined with `PtrSize: 8, RegSize: 8` (`cmd/internal/sys/arch.go`): Go pointers are 64-bit, and the assembler narrows every address to 32 bits at the memory instruction (`I32WrapI64` before loads and stores, `I64ExtendI32U` after reading the i32 `SP` global) in `cmd/internal/obj/wasm/wasmobj.go`. The linker *defines* and *exports* a memory with no maximum and writes data segment offsets as `i32.const` (`cmd/link/internal/wasm/asm.go`). Nothing in the tree knows memory64.
- Upstream is going the other way: proposal [golang/go#63131](https://github.com/golang/go/issues/63131) (accepted) adds `GOARCH=wasm32` with 32-bit pointers; CLs titled "all: enable the wasip1/wasm32 port" reference it on 2026-09-22 and a related compiler commit on 2026-10-15 [web]. The thread's position (2023): "all existing hosts use a 32 bit architecture, and it has become clear that it is here to stay." Go 1.27 (2026-08-19) has no wasm64 [web].
- Go is written in Go. Any Go compiler that runs *inside* Dolly needs a Go runtime that runs on Dolly first. That rules out everything except a port of gc itself, with a host-cross-built stage 0 exactly as Rust has.

### Route A: `GOOS=dolly GOARCH=wasm64`, the only real one

**Bootstrap.** Stage 0: the patched tree cross-compiled on Linux (`GOOS=dolly GOARCH=wasm64 go build cmd/...`; Go cross-builds its own tools in minutes), packaged like `rust-sdk.tar.gz`. Stage 1: inside Dolly, `go install std cmd` with the seed as `GOROOT_BOOTSTRAP`. Go's toolchain builds are reproducible across hosts since 1.21, so stage 1 equalling stage 0 byte for byte is plausible, a better story than Rust's two generations [inferred].

**What changes** (grouped; the first group is the part no upstream port has done):

1. *memory64 in the backend.* `cmd/internal/obj/wasm/wasmobj.go`: drop the wraps and extensions at the sites listed above, make `SP` an i64 global, `memory.size/grow` i64. `cmd/link/internal/wasm/asm.go`: import `env.memory` as shared i64 with a maximum instead of defining it, `i64.const` segment offsets, emit the three `dolly.*` custom sections (or leave a module `cc` can stamp). `cmd/internal/sys`, `internal/goarch`, `cmd/dist`, `go/build`: a new arch name with the same sizes as `wasm`. `runtime/asm_wasm.s`, `sys_wasm.s`, `mem_*`: address widths. The SSA backend (`cmd/compile/internal/wasm`) already computes in i64 and probably changes little [inferred].
2. *A GOOS.* The wasip1 port is the template and it is small: `runtime/os_wasip1.go` has 9 imports in about 290 lines (`proc_exit`, `args_*`, `environ_*`, `clock_time_get`, `fd_write`, `random_get`, `poll_oneoff`); `syscall/fs_wasip1.go` has 26 imports in about 690 lines [read]. A `dolly` GOOS replaces each with one packet through `dolly_process_0.call` (`include/dolly/process.h` lists about 50 operations: files, pipes, dup, poll, clocks, random, **spawn, wait, signals, alarm**). Dolly's substrate is richer than WASI 0.1: `os/exec` can work (wasip1 returns `ENOSYS` for `Pipe`, `Dup`), which `cmd/go` needs to run `compile`, `link` and `asm`.
3. *Build tags.* Every `//go:build wasip1` file in `os`, `net`, `internal/poll`, `time`, `os/signal`, `syscall` needs a `dolly` twin or a shared tag: dozens of files, mostly mechanical [inferred].

**Runtime pieces against Dolly:**

| Piece | Status |
| --- | --- |
| Goroutines | Pure compiler mechanism on wasm (PC_B dispatch, unwind to the scheduler loop, `wasm_pc_f_loop`) [read]; works today without host support; unchanged. |
| Scheduler and threads | `GOMAXPROCS=1`; `newosproc0` throws on wasip1 [read]. Matches Dolly's serial preference; no `threads@0` needed. |
| Signals, preemption | wasip1 has none; Dolly's delivery at syscall boundaries fits a cooperative runtime. Optional later: `INTERRUPT_POLL` for `os/signal`. |
| Network poller | wasip1 waits with `poll_oneoff`; Dolly has `FD_POLL`, `CLOCK_SLEEP`. `net`: only local sockets (`sockets@0`) and no `AF_INET`, as for every Dolly program. |
| Memory | `memory.grow` on the shared memory64, 8 GiB maximum; Go's sbrk-style arena allocator needs no `mmap`. |
| Browser stack | Every Go call is a Wasm call; frames are small (SP copy, PC_B, a few i64). The compiler itself recurses; the toolchain would carry `dolly.process.stack` like `cc` does [inferred]. |
| cgo | Not supported on wasm upstream; stays unsupported. Pure-Go programs only. |

**Value.** Not the language alone but the pure-Go tool ecosystem agents reach for: `gh`, `gofmt`/`gopls`, `esbuild`, `hugo`, `fzf`, `yq`, `age`, `caddy`-class servers (those last are moot without network). This is the same shape as Rust unlocking ripgrep, fd and Codex.

**Honest size.** The wasip1 port was a multi-month effort by two engineers for Go 1.21 and touched no code generation [inferred from its history; not re-checked]. Here the code generator and linker change too, nothing exists to copy for memory64, and upstream will not take wasm64 while it ships wasm32, so this is a **fork maintained across two Go releases a year**, like Rust's target patches but larger. Estimate: 6–10 engineer-weeks to `go build hello` in a session and the toolchain rebuilding itself inside Dolly with a byte comparison; the fork then costs days per Go release. A sensible first spike (1–2 weeks) is memory64 alone, `GOOS=wasip1 GOARCH=wasm64` run under a memory64-capable host on the developer's machine, which settles the backend before any Dolly code is written.

### Route B: TinyGo — not a path

Written in Go, binds LLVM through cgo, has no wasm64 target (`targets/`: `wasm.json`, `wasi.json`, `wasip1.json`, `wasip2.json`, `wasm-unknown.json` only) [read], cannot compile the Go toolchain or itself, and its default wasm scheduler depends on Asyncify. It can only run in Dolly *after* route A, as a second compiler. Nothing of value before that.

### Route C: gollvm — dead end

C++ `gofrontend` on LLVM (no Go seed needed, a plus), but x86_64 Linux only and its last commit is about two years old ("gollvm: update to LLVM mainline") [read: `go.googlesource.com/gollvm/+log`]. Its runtime, libgo, switches goroutine stacks with context switching that Wasm cannot do; a rewrite of libgo's scheduler on Asyncify would be a research project.

### Route D: gccgo — dead end

GCC has no WebAssembly backend and GCC is not in Dolly.

## 3. OCaml

### The bytecode route [read: `ocaml/ocaml` trunk; docs]

- **Stage 0 is upstream's and machine-independent.** OCaml's tree carries `boot/ocamlc` (bytecode) and the runtime in C. `cc` builds `ocamlrun` from `runtime/`; `boot/ocamlrun boot/ocamlc` compiles the stdlib and `ocamlc`; `make bootstrap` rebuilds until the new `ocamlc` equals `boot/ocamlc` byte for byte ("Fixpoint reached"). That is Dolly's "second generation equals the first" check, done by upstream's own Makefile, with no host-built seed at all: the same class of exception as Zig's `zig1.wasm`, better than Rust's. `ocamllex`, `ocamlyacc`, `ocaml` (the toplevel REPL), `ocamldep`, `ocamldoc` all come with it in bytecode.
- **No `ocamlopt`.** The native compiler's backends are amd64, arm64, riscv, s390x and power; there is no WebAssembly backend and `--disable-native-compiler` is a configure option [read]. See "native" below.
- **configure.** Autoconf with `AC_CANONICAL_HOST`: run in the Emscripten container at preparation, as `prepare-cpython.sh` does, and record the exception. Flags: `--disable-native-compiler`, `--disable-shared` (so no `dll*.so` stub loading; programs with C stubs link with `-custom` through `cc`, which `Sys.command` reaches via `system()`) [read: Dolly's `system`]. The alternative, `dso@0` with an `-rdynamic` `ocamlrun` loading `dllunix.so` as CPython loads extensions, works too but forbids `-pthread` [read].
- **Without fork.** `Sys.command` → `system()` → `slop -c`: works. `Unix.create_process` uses `posix_spawn` with `adddup2`/`addclose` when `HAS_POSIX_SPAWN`, and `fork` only as fallback (`otherlibs/unix/spawn.c`) [read]; `Unix.open_process_*` are built on it in current OCaml [inferred]. `Unix.fork` fails explicitly, as it should.
- **Which pieces need what.** The compiler, stdlib and toplevel: nothing beyond files. `unix`, `str`: C stubs, static. `threads`: pthreads, so `-pthread` and `threads@0`, otherwise `Thread.create` fails. Domains: see 5.x.

### 4.14 against 5.x

| | OCaml 4.14 (4.14.4, 2026-06-15; LTS until at least 2027 [web]) | OCaml 5.5.0 (2026-06-19 [web]) |
| --- | --- | --- |
| Heap | malloc-based, no reservation | `caml_init_domains` reserves `max_domains × minor_heap_max` with `mmap(PROT_NONE)` and commits arenas with `mmap(MAP_FIXED)` (`runtime/unix.c`, `domain.c`) [read]. `Max_domains_def` is 128 on 64-bit (`caml/domain.h`); the max starts at the initial minor heap, `Minor_heap_def` 262,144 words = 2 MiB (`gc_ctrl.c`) [read]: **256 MiB reserved at every start**. On Dolly the reservation is committed and zeroed, and the `MAP_FIXED` commit fails with `ENOTSUP` → fatal "No memory for minor heap arena". Fix: take the file's Cygwin branch (`mprotect`, a success no-op here) for `__dolly__`: a two-line patch; and `OCAMLRUNPARAM=d=4` or a changed default to make it 8 MiB. `Gc.set` with a larger minor heap re-reserves [read]. |
| Signals | bytecode runtime installs none | `caml_init_signals` is fatal for domain 0 if `sigaltstack` fails (`signals.c`) [read]; Dolly has no alternate stacks → patch it out (it serves stack-overflow detection). |
| Threads | optional `systhreads` | runtime always links pthread mutexes/condvars: fine on Dolly's weak stubs; `Domain.spawn` fails without `-pthread`, and with `threads@0` would get up to 16 domains and `recommended_domain_count` 4 [inferred, unmeasured: Rust's threads do work this way]. |
| Effects | not available | in bytecode, fibers live in the interpreter, no C stack switching [inferred from the design]. |
| Patches expected | none | two small runtime patches plus a runtime parameter |

Recommendation: 5.5 is what the owner means by OCaml and the patches are small; 4.14 is the zero-patch fallback if 5.5 surprises.

### Tooling

- **findlib** (`ocamlfind`): OCaml plus a Makefile, trivial.
- **dune**: bootstraps with `ocaml boot/duneboot.ml`, then builds itself; bytecode is fine. It spawns through Jane Street's `spawn`, which uses `vfork`/`fork` + `execve` with no `posix_spawn` path and no fallback (`spawn_stubs.c`) [read]: one small target patch to `Unix.create_process`-style spawning. Practical: 1–2 days after the compiler.
- **opam**: large (its `make cold` bundle includes `dune`, `dose3`, `cudf`, the `mccs` C++ solver, `re`, `cmdliner`…), needs `tar`, `patch`, `curl` (present or packageable), a relay for `opam.ocaml.org` unless its CORS allows the broker, and a bytecode-only switch (`ocaml-system`); packages that demand `ocamlopt` fail. Practical but low priority: 1–2 weeks and a relay [inferred].
- **ReScript** is an OCaml program whose output runs on `janis`: a free follower.

### Native code for wasm64: none exists

`wasm_of_ocaml` compiles bytecode to **WasmGC** (needs the GC and EH proposals; effects by CPS, JSPI or WasmFX) and runs in a JavaScript engine or Wasmtime [web]. A Dolly process is a memory64 module with one C-shaped import and no nested WebAssembly, so its output cannot be a Dolly program, and it is not an `ocamlopt` backend anyway. `wasocaml` is research. A real `ocamlopt` wasm64 backend would have to redo exceptions over Wasm EH, frametable root scanning over a shadow stack and effects without stack switching: months, and nobody is doing it. OCaml in Dolly is bytecode, 5–10× slower than native and then Wasm's own factor; the compiler compiling its own stdlib will take minutes, not seconds [inferred].

### Honest cost

`ocaml` package (runtime, `ocamlc`, toplevel, `ocamllex/yacc`, stdlib, `unix`/`str`, upstream's fixpoint as the recipe's check, browser test, README with the configure exception): **2–4 days**. `findlib` + `dune`: +1–2 days. `opam`: +1–2 weeks with a relay. Risk: low; the one unknown is how long `make bootstrap` runs in Wasm.

## 4. The other candidates

Grouped by what the port is. "Needs" lists what of Dolly; "Blocker" what must change.

### A. Interpreters in C that `cc` builds (days each)

| Language | What compiles what | Needs / blocker | Value | Cost |
| --- | --- | --- | --- | --- |
| **Perl** 5 | `cc`; its own `Configure` (metaconfig, probes by compiling and running test programs: in-container or in Dolly, untested) then `miniperl` builds the rest | No threads (`-Uusethreads`), no JIT. `system`/backticks use `fork` on Unix; the `!HAS_FORK` branches exist (VMS, OS/2, Symbian) and a `hints/dolly.sh` with `d_fork=undef` may select them, else a small patch [inferred]. CPAN over the broker (relay likely); XS modules build with `cc` via MakeMaker. WebPerl (Emscripten fork, beta) is the only prior Wasm port [web]. | High as a build enabler: this repo already generates files with host perl in three places (`demos/wine/README.md`, NetSurf, xkb rules) and declined `ne` for lack of it [read]; agents use it for text. | 3–7 days |
| **Ruby** (CRuby) | `cc`; autoconf in container; `miniruby` builds the rest | Upstream's own `wasm32-wasi` port (`wasm/`) uses Asyncify for `setjmp`, fibers and scanning Wasm locals for the conservative GC; `Thread` and process spawning unsupported there [web]. On Dolly: `setjmp` is Wasm EH, so only the GC and fibers remain. Options: `-O0` like Emacs (measured to work for Emacs's collector) or `wasm-opt --asyncify` from Dolly's own Binaryen (memory64 support of that pass unverified); fibers via `coroutine/pthread` on `threads@0` (16) or Asyncify. `Kernel#system`/`spawn` are `fork`-based: a target branch to `posix_spawn` (strains the unchanged-upstream rule). Gems: RubyGems' `net/http` is on sockets → a transport like CPython's `_dolly_http`, plus a relay. | High for agents (Ruby is common; Rails is moot). | 1–3 weeks; risk medium (GC, fibers) |
| **Tcl** (+Tk) | `cc`; autoconf (`tcl.m4` switches on `uname -s`, unknown system takes defaults) in container | `TclpCreateProcess` has `posix_spawnp` under `HAVE_POSIX_SPAWNP` but uses it only when glibc ≥ 2.24 is detected, else `fork`/`vfork` [read: `unix/tclUnixPipe.c`]: a one-line patch. Tcl 9 always has threads and a notifier thread → `-pthread`/`threads@0` [inferred]. Tk on Dolly's X server (`demos/x11`) is a natural follow-on; Expect; SQLite's test suite. | Medium-low | 2–4 days; Tk +3–5 |
| **PHP** (CLI) | `cc`; autoconf in container; release tarballs ship the parser | Non-ZTS, no opcache JIT (JIT impossible; opcache optional), `--disable-zend-signals` (SIGPROF/SIGUSR rejected), `pcntl` off; `shell_exec`/backticks go through `popen` (works), `proc_open` is `fork` (fails explicitly). Composer over the broker. WordPress Playground proves the wasm32 Emscripten build [inferred]. | Medium-low | 3–6 days |
| **Scheme** | Chibi: a few C files, precise GC, `cc` + Makefile. Gambit: compiles Scheme to C; the release ships the compiler's generated C, so `cc` builds `gsc`, which rebuilds itself (a fixpoint). Chicken: Cheney-on-the-MTA with `alloca` and `longjmp`; upstream ships `chicken-boot` C. Guile: bytecode VM, optional JIT (`--disable-jit`), Boehm GC (the Wasm-locals problem again), hours compiling `.go` files. | Chibi: nothing. Gambit: large generated C units vs `cc` memory and browser stack [inferred risk]. Chicken: scans the C stack, which is in linear memory here [inferred]. Guile: `-O0` or Asyncify. | Low-medium (evidence of the interface more than agent demand; Emacs already has its Lisp) | Chibi 1 day; Gambit 2–4; Chicken 3–5; Guile 1–2 weeks |
| **Racket CS** | Chez Scheme's `pb` (portable bytecode) interpreter mode; upstream ships pb boot files in the repo (machine-independent bootstrap, like OCaml's `boot/`) | pb is 3–10× slower than native Chez; no JIT needed. `racket`, `raco`; no DrRacket. | Medium (teaching, agents know it) | 1–2 weeks |
| **Common Lisp: ECL** | Compiles Lisp to C and calls `cc` at run time (fits Dolly's thesis: the compiler is a program in the sandbox); bytecode interpreter too | Boehm GC → `-O0` or Asyncify. SBCL (native codegen) and CLISP (register scan via `setjmp`) are out. | Medium-low | 1–2 weeks, risk medium |
| **SWI-Prolog, Janet, Wren, gforth** | C, CMake or Makefile; SWI-Prolog maintains an Emscripten build [inferred] | SWI: threads optional; `shell/1` is `fork`. Janet: single amalgamation, VM fibers, precise GC. | Low (niche); hours to a day each | hours–2 days |

### B. Languages that compile to C, with an upstream C seed (days to weeks)

| Language | What compiles what | Needs / blocker | Value | Cost |
| --- | --- | --- | --- | --- |
| **Nim** | `csources_v2`: generated C of the compiler, per OS/CPU directory (`c_code/2_2` = linux/amd64; OS list: linux, freebsd, …, no Dolly; CPUs: no wasm) [read: `build.sh`]. `cc` builds `nim0`, `koch boot` rebuilds twice and compares (upstream's own fixpoint). | A `dolly` OS and `wasm64` CPU entry in `compiler/platform.nim` and `std/posix` tables; csources for that pair generated on the host (a bootstrap exception of readable C, smaller than Rust's) — compiling the linux/amd64 C instead would claim Linux. ORC GC is refcounting (no stack scan); `osproc` spawns with `posix_spawn` by default [inferred]; `--threads:off` or `threads@0`. | Medium: agents know it; a compile-to-C language shows off `cc` | 1–2 weeks |
| **V** | upstream's `vc/v.c` (one generated C file) → `cc` → `v self` | Boehm GC default (`-gc boehm`): the Wasm-locals problem; `-gc none` leaks. | Low-medium | 3–5 days + GC caveat |
| **Vala** | `valac` is Vala compiled to C, generated C in release tarballs; GLib exists (`demos/gtk`) | Nothing special | Low | 1–2 days |

### C. Compilers in C/C++ on LLVM, linking the LLVM Dolly already builds (weeks)

| Language | What compiles what | Needs / blocker | Value | Cost |
| --- | --- | --- | --- | --- |
| **C3** | `c3c` is C over LLVM-C; CMake against `llvm21`'s archives | Has wasm32; wasm64 freestanding believed present, unverified [web found nothing]; an `os` with libc for Dolly in its stdlib; links via `cc`. | Low (niche) but the cleanest "C program that uses Dolly's LLVM" | 1–2 weeks |
| **Odin** | C++ unity build over LLVM-C | Targets are wasm32 and `wasm64p32` (32-bit pointers) [inferred]; a true memory64 target plus `core:os` for Dolly is a BSD-port-sized job; its thread pool needs `-pthread`. | Low-medium | 2–4 weeks |
| **Fortran (flang)** | In the LLVM monorepo; `mojo-llvm` already builds MLIR; `flang-rt` is C++ | Build cost: flang's templates are as heavy as anything Mojo's build met (5 GB units) [inferred]; driver must link through `cc`. | **Unique concrete value**: SciPy, BLAS, LAPACK from source via pip, where NumPy and Pandas already build [read] | 2–4 weeks, hours per build |
| **Crystal**, **D (LDC)** | compilers written in themselves → host seed; LDC's druntime switches fiber stacks in asm, suspends threads with `SIGUSR`, scans conservatively | Runtime rewrites, no wasm64 runtime | Low | months; no |
| **Swift** | C++ compiler with Swift-written parts (needs a host Swift), stdlib built by itself; SwiftWasm is wasm32-wasi only | Build cost several times LLVM's per stage in 9 GB slots; single-threaded concurrency option exists | Medium (Swift developers) | months; no |

### D. Virtual machines that need threads, memory reservations or a JIT

| Language | State | Why not now |
| --- | --- | --- |
| **Erlang/Elixir** | erts is C and OTP tarballs ship bootstrap `.beam` files (machine-independent); Elixir compiles from Erlang alone. OTP ≥ 21 requires SMP: schedulers, poll, async and dispatcher threads (`+S1 +SDio1 +A0` still several; within 16 [inferred]); `open_port` uses the `fork`-based `erl_child_setup`; the `erl` launcher `exec`s `beam.smp`. BeamAsm JIT is x86/arm only; the interpreter path is fine. Popcorn (Software Mansion, 2025) judged "running the full BEAM virtual machine on WebAssembly … not feasible" and ships AtomVM on Emscripten instead [web]; AtomVM runs beams compiled by a host OTP, so it is not self-contained. | 4–8 weeks, high risk; medium value |
| **Java** (and Kotlin, Scala, Clojure) | HotSpot Zero is portable C++ but wants a dozen threads, `MAP_FIXED`/`mprotect` reservations for the heap and card tables (refused or no-ops here), `SIGSEGV` for implicit null checks and polling pages (a Wasm trap is fatal). `javac` is Java: a boot JDK's class files would be the stage 0 and the class library rebuilt in Dolly by `javac` on the ported JVM. No open HotSpot-on-Wasm exists (CheerpJ is proprietary); JamVM/Avian are old. | months; not now, despite high demand |
| **.NET** | Mono's interpreter runs on wasm32 Emscripten (Blazor); Roslyn and the SDK need a running runtime and a host `dotnet` to build; no 64-bit | no |
| **Haskell (GHC)** | official `wasm32-wasi` cross-compiler only (GHC runs on the host); GHC in GHC needs a seed; RTS reserves address space; no wasm64 | no |
| **Dart, Julia** | VM JIT (Julia's system image is built with the JIT); `dart2wasm` emits WasmGC, not a Dolly process | no |

### E. Free followers (one recipe each, no port)

- **Rust-written languages and tools** build with the existing Cargo like ripgrep did (68–87 s each [measured]): **Gleam** (JS target runs on `janis`), **Scryer Prolog**, **Nushell** (a shell), **Typst** (PDF output for agents), Rhai, Rune, Koto, starlark-rust.
- **JavaScript-hosted** on `janis`: ReScript (via the OCaml route), CoffeeScript, Civet, Babel, the TypeScript already there.
- **Python-hosted**: Hy, Coconut. **Lua-hosted**: Fennel, Teal (Lua 5.1 is a package; `DOLLY_LUA55` is already pinned).

## 5. Ranked recommendation

Cheapest valuable first; each line is one task.

1. **Perl** (3–7 days). The highest value per day: it moves three host-side generation steps into Dolly, admits `ne` and the many upstream builds that assume perl, and is a tool agents use. Risk is `Configure` and the `fork`-less `system` path.
2. **OCaml 5.5** (2–4 days), the owner's wish and the best bootstrap story in the catalog: upstream's own `boot/ocamlc` and fixpoint, nothing host-built, bytecode only, two small runtime patches (memory map, signal stack) and a `max_domains` default. Then **findlib and dune** (+1–2 days, one spawn patch). opam later, with a relay. State plainly that there is no native OCaml for wasm64 and will not be.
3. **Free followers** as separate small recipes when wanted: Gleam, Scryer Prolog, Typst, Nushell (Cargo); Chibi, Janet (cc). Hours each; they prove the interface at almost no cost.
4. **Ruby** (1–3 weeks, medium risk). High agent value; the GC-and-Wasm-locals question must be measured first: build at `-O0` as Emacs does, or check `wasm-opt --asyncify` on a memory64 module from Dolly's Binaryen. Fibers via `threads@0`. A `posix_spawn` branch for `Kernel#system` and an HTTP transport for RubyGems are the patches that strain "unchanged upstream".
5. **Tcl (+Tk on X11)**, **PHP**, **Nim**, **Racket CS (pb)**: days to two weeks each, medium-low value; take when a concrete use appears (Tk and Expect for Tcl; a Playground-like page for PHP).
6. **flang** (2–4 weeks) only if SciPy-from-source becomes a goal; it is the one candidate with value no other language gives.
7. **Go**: route A only, **6–10 engineer-weeks** to a toolchain that builds itself inside Dolly, as a fork carried across two Go releases a year, with upstream moving to wasm32. Worth it for the pure-Go tool ecosystem (`gh`, `gofmt`/`gopls`, `esbuild`, `hugo`, `fzf`), which is to Go what ripgrep and Codex were to Rust. Start with the 1–2 week memory64 spike on the host before writing any Dolly code; TinyGo, gollvm and gccgo are not paths.
8. **Not now**: Erlang/Elixir (erts), Java and the JVM languages, Swift, D, Haskell, .NET, Dart, Julia: each needs threads beyond 16, memory reservations Dolly cannot honour, a JIT, or a host-built seed of months of work, and none has a Wasm port to lean on.

Measured anchors used for every extrapolation: LLVM 24's closure 50 min and 7 GB; `rust-llvm` 1,455 s; a rustc generation 8–9 min; Cargo 9 min; a Cargo tool 68–87 s; `zig1 → zig2.c` 4.3 min and `cc -O2` of 64 MB of C 104 s; Mojo's compiler 13 min at 6.2 GB; Emacs runs only at `-O0`; a configure script needs about 4,700 Workers inside Dolly. Everything about a candidate's own runtime is read in its source or inferred, and is marked so above; the first task of any pick is to turn one of those marks into a measurement.

### Critical Files for Implementation

- demos/rust/README.md — the seed-plus-generations pattern a Go port copies, and `rust-linker.c` for a foreign linker handing the final link to `cc`
- demos/python/prepare-cpython.sh — configure in the pinned container at preparation, the route every autoconf interpreter (OCaml, Perl, Tcl, PHP, Ruby) takes
- src/process/mmap.c — `MAP_FIXED` refused and `PROT_NONE` committed: the two lines OCaml 5's runtime patch answers to
- src/compiler.cpp — the executable contract (`dolly.process*` sections, the single import, memory64 flags) a Go linker or `ocamlc -custom` output must satisfy
- demos/tools/Dollyfile-jq — the package recipe template for an interpreter built from a pinned release by `cc`
