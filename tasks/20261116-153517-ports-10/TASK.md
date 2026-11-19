# Lean, rustc and OCaml still work around 'a threaded program has no -rdynamic', which the core lifted on 2026-11-04: Lean's symbol table and plugin limits, rustc's serial codegen, OCaml's stated reason

- STATUS: OPEN
- PRIORITY: 140
- TAGS: audit,ports,lean,rust,ocaml,dso,0.1.8

## State (2026-11-19)

Lean, OCaml and Wine on `ws/ports`, merged into `integrate/0.1.8`:

- Lean: `lean-dolly.mk` links `lean`, `lake` and `leanc` with `-rdynamic`, as upstream's CMake
  links its programs (`CMAKE_DYN_EXE_LINKER_FLAGS`), with what upstream's shared libraries hold
  whole (`libInit_shared`: Init, Std and the runtime; `libLake_shared`: Lake), which is what the
  table named before; a program Lake links is not `-rdynamic`; `lean-symbols.c`, its rules and the
  `lean_dolly_symbol` hunk are gone, the interpreter's `dlsym(RTLD_DEFAULT, ...)` is upstream's,
  and `lean-stage0` and `lean` declare `dso@0`, which a `-rdynamic` program needs. The README's
  plugin limit says they would load through `dso@0`, which the lean test does not try.
  Building `lean-stage0` so in this tree measured one more limit: its link failed on
  `sched_get_priority_min` and `_max` (`build-2a.log`), which libuv's `uv_thread_setpriority`
  asks and `-rdynamic` keeps, since it exports libuv's API; Dolly's libc defined them (ENOSYS)
  for one-thread programs alone (`process/libc-adapter.c`, under `#ifndef
  __EMSCRIPTEN_PTHREADS__`). They are defined for threaded programs too now, a seed change the
  compiler round builds (`npm run build:runtime` in this tree puts them in
  `build/process-threads/libdolly-process.a`, where they were not). Replayed in a session of round 1113's `system` with `stack-wrap` and
  `libuv` (`lean-replay.mjs`), `Dollyfile-lean-stage0`'s rows from this branch's `port.tar`, with
  the same two functions compiled beside the link, build the first lean (make 621 to 788 s), a
  212.6 MiB program that prints `Lean (version 4.35.0, wasm64-unknown-dolly, "Release")`; with
  the release's `Init` library in place it runs a program by the interpreter, whose calls into
  `Init` (`List.range`, `Nat.toDigits`, `String.join`, `IO.Process.output`) it finds among the
  exports, and prints `285 0149 beef`, then `spawned 0` from the child it spawned
  (`lean-replay.log`, Chromium, 746 s). Round 018k (`integrate/0.1.8` `8d666a4e4`) built
  `lean-stage0`, `lean-std`, `lean-meta` and `lean` on the seed with the libc change, and the
  lean test passed in Chromium (94.9 s) and Firefox (126.7 s): done.
- rustc (seed: it changes the Rust seed), on `fix/rc-ports`: rustc generates code on
  upstream's threads. `toolchain/rust.patch` no longer has the serial coordinator (`serial.rs`
  and `write.rs`'s hunks), LLVM's thread check, the compiler run on the main thread or the
  jobserver proxy without its helper (479 lines off, 12 on). Its one new hunk: no jobserver
  crosses a process here (Cargo's child gets none), so each `rustc` makes its own, with one
  token for each processor Dolly reports (`available_parallelism`, 4 in a threaded program,
  measured) instead of upstream's 32: threads@0 runs 64 threads in a session, 32 a process.
  `rust-linker.c` links rustc `-pthread -rdynamic`, and exports `__dolly_dso_threads`: it links
  with `--no-export-dynamic` (rustc's functions are too many to export), so the loader's record
  for the other threads went unexported and the threaded rustc loaded no procedural macro,
  measured: `tinystr`'s build failed "can't find crate for `displaydoc`", rustc's log
  "Failed to load proc-macro", and a C host linked `-pthread -rdynamic -Wl,--no-export-dynamic`
  got "not in a program using threads@0 without -rdynamic" from `dlopen`, which the export
  fixes (`dso-export.log`). `rust-llvm` builds LLVM with threads and runs its CMake checks
  `-pthread`, against the libc rustc links: without it LLVM found dlmalloc's `mallinfo`, which
  the threaded libc lacks, and rustc's link failed on it.

  Measured in `work/rc-ports` (Chrome, `CPUWeight=20` beside round 018k's suites; evidence in
  `work/evidence-2026-11-19/rc-ports/threaded-rustc/`): `rust-build` took 1,420 s, round 018k's
  serial one 2,732 s. By step, threaded against that round: the first rustc, by the serial seed,
  8 min 59 s (12 min 55 s); the library 39 s (1 min 17 s); the second rustc 6 min 27 s
  (14 min 38 s); rustdoc 1 min 32 s (4 min 14 s); the library again 41 s (1 min 18 s); Cargo
  3 min 59 s (9 min 23 s). The same 251 crates of rustc took the serial seed 8 min 59 s and the
  threaded first rustc 6 min 27 s in the same build. Peak memory 8,753 MiB (7,478). The rust demo
  test passed in Chromium (64.1 s; round 018k 101.7 s) and three times in a row in Firefox (81.0,
  80.7, 85.6 s; 113.3 s).

  The bytes are the serial build's: against round 018k's images, 3,816 of `rust-build`'s 3,824
  files are the same, byte for byte, the 25 standard library rlibs the second rustc built and
  Cargo, which it compiled, among them; the rest are `rustc-real` and the linker adapter (of
  changed sources) and the recipe records. So are the programs of `ripgrep`, `fd`, `protox`,
  `cbindgen` and `naga`, built by the threaded rustc here (`compare-rust-build.txt`,
  `compare-packages.txt`). The recipe's own check, the library of the first rustc against that
  of the second, both threaded, passed.

  The second pass, in the same tree: this `rust-build` and `cargo` pinned as the Rust seed
  (`8b779884…`, `demos/rust/source-pins.sh`), `rust-build` built from it in 1,265 s (the first
  rustc, by the threaded seed, 6 min 05 s) gave every file of the first pass again, `rustc-real`
  among them (`compare-second-pass.txt`), and pinning the seed from it gave `8b779884…` again:
  the threaded rustc is a fixed point. The archive is
  `work/rc-ports/.cache/dolly-rust-seed-8b779884….tar.gz`.

  `codex`, built by it here (`CPUWeight=20`, `MemoryMax=20G`): 1,683 s, round 018k's serial
  build 2,771 s (Cargo's step 26 min 40 s against 44 min 27 s); peak memory 18,856 MiB against
  12,832 (each `rustc` of `cargo rustc -j 4` holds up to four modules in code generation); its
  1,958 files but the recipe records are the serial build's, byte for byte
  (`compare-codex.txt`); the codex test, its device sign-in included, passed in Chromium
  (29.6 s) and Firefox (36.5 s).

  Left: the round builds the other Rust images with it (`photocraft`, SpiderMonkey's chain), and
  its compiler stage must leave the Rust seed pin at `8b779884…`.
- OCaml: `prepare-ocaml.sh` and the README give upstream's reason for `--disable-shared` (its
  configure makes shared libraries only for the systems it lists; measured in the pinned
  archive's `configure.ac`, which without it sets `supports_shared_libraries=true` with
  `mkdll=shared-libs-not-available`). Round 018k built `ocaml`, and its test and fixpoint passed
  in Chromium and Firefox: done.
- Wine's `gmoduleconf.h`, README and `wine_dlopen` message (`port/libwine.c`) and GTK's README
  no longer name the lifted limit: what Wine opens is what is linked into its one program.

Images the change rebuilds: the four Lean images, `ocaml` (the script's comment is in its
staging key), `wine-build` and `wine` (`gmoduleconf.h`), and the Rust chain from the package
that compiles `rust-linker.c`; rustc's threads rebuild `rust-llvm`, `rust-sdk` and every image
after them.

## What

Until `0801f32c0` (2026-11-04, "dso@0 places libraries and FFI closures in every thread of a
host using threads@0") a program using `threads@0` could load no library: `dlopen` answered
`ENOTSUP` and `cc` refused `-pthread` with `-rdynamic`. Since then a host may be both
(`docs/process-model.md`, "Threads, DSOs and FFI"). Measured 2026-11-16 in Chromium on round
1117's `system` (with the `python` package for `dso@0`), logs in `work/audit-1116-evidence/ports/`:

- a C program built `cc -pthread -rdynamic` finds its own exported function with
  `dlsym(RTLD_DEFAULT, ...)` from a second thread and calls it (`thread: dlsym found, f(6) = 42`;
  `dso-threads-probe.json`, `dso-threads-probe.log`);
- such a host `dlopen`s a `cc -shared -fPIC` library whose function calls back into the host, as
  an OCaml stub library calls its runtime, from a second thread and from `main`
  (`thread: dlopen ok, stub_twice(20) = 42`, `main: stub_twice(1) = 4`; `dso-shared-probe.json`,
  `dso-shared-probe.log`).

Three ports were shaped by the old rule and still are:

- **Lean** (from 2026-10-28, `6abef341e`). Its interpreter calls compiled code by the symbol it
  finds with `dlsym` among the program's `-rdynamic` exports; "A threaded Dolly program has no
  `-rdynamic`, so `lean` and `lake` are linked with a table of the same symbols"
  (`demos/lean/README.md:44-50`), generated by `demos/lean/lean-symbols.c` (273 lines, five uses
  in `lean-dolly.mk`) and looked up through a hunk of `lean-dolly.patch:10-16`
  (`lean_dolly_symbol`). The README's limits (`:88-90`): "A threaded Dolly program loads no shared
  objects, so `lean --plugin` and `--load-dynlib`, and Lake's `precompileModules` and shared
  `extern_lib`s, fail when they load one."
- **rustc**. `demos/rust/rust-linker.c:31-42` links a program that loads procedural macros
  (`-rdynamic`) without `-pthread` ("cc links such a host without threads"), so rustc runs one
  thread: `demos/rust/toolchain/rust.patch` replaces the codegen coordinator with a serial one
  (`compiler/rustc_codegen_ssa/src/back/write/serial.rs`, 127 lines, and 105 changed lines in
  `write.rs`; "Dolly's frontend and codegen coordinator both run synchronously"), and
  `Dollyfile-rust-llvm:53` builds rustc's LLVM without threads. Each `rustc` of every Rust
  image's build (`rust-build` 36.6 min, `codex` 40.5, `photocraft` 35.7 in round 1117) compiles
  its crate on that one thread; how much of those minutes it is was not measured.
- **OCaml** (`3fe1f610a`, 2026-10-23). `demos/ocaml/prepare-ocaml.sh:42-43` configures with
  `--disable-shared` (`:51`): "no shared stub libraries, since Dolly's -rdynamic excludes the
  threads OCaml 5's runtime is built with". So a program with C stubs (`unix`, `str`,
  `threads`) must be linked with a custom runtime by `cc` (`demos/ocaml/README.md:40-43`), and the
  toplevel loads no library with C stubs: "`#load "unix.cma"` needs shared libraries"
  (`README.md:53-55`). Upstream's `ocamlrun` loads `dllunix.so` and the like with `dlopen`, which
  the second probe above does. But upstream's own configure gives no shared libraries to a host
  it does not list: OCaml 5.5's `configure.ac` (about lines 1508-1555 of the pinned archive) sets
  the command that makes them only for Darwin, Linux, the BSDs, GNU, Haiku, Solaris and Windows,
  and otherwise `mkdll='shared-libs-not-available'`. So the stated reason is wrong, and the result
  is the one upstream gives an OS it does not know; enabling them takes a `configure.ac` hunk for
  `wasm64-*` or claiming a listed OS, which AGENTS.md's porting rules exclude.

The same reason is also written in `demos/wine/programs/gimp/gmoduleconf.h:2` ("a threaded
program has no dlopen") and among the reasons Wine is one statically linked process
(`demos/wine/README.md:431-433`: "no `dlopen` in a threaded program"; the others, no `fork` and
no second process to hand a descriptor to, stand), and as the reason `gtk-dolly.patch` builds
GTK's library static (`demos/gtk/README.md:39-41`: "a threaded program loads no library"; static
libraries are what every package exports, so the hunk stays and only the reason is wrong).
Related, open: `tasks/20261112-084621-rustc-exports` (what an `-rdynamic` rustc exports).

AGENTS.md: "Prefer unchanged upstream source plus target/toolchain configuration over source
forks and per-program compatibility patches"; "Development iteration speed is king".

## Smallest fix

Lean: link `lean` and `lake` with `-pthread -rdynamic`, drop `lean-symbols.c`, its rules and the
`lean_dolly_symbol` hunk, and try `lean --plugin`. rustc: link it with `-pthread -rdynamic` in
`rust-linker.c`, build `rust-llvm` with `LLVM_ENABLE_THREADS`, drop `serial.rs` and its
`write.rs` changes, and measure `rust-build` and `codex` against round 1117 (memory too: a
threaded process takes its 8 GiB maximum before a second thread starts). OCaml: replace the
reason in `prepare-ocaml.sh:42-43` and `README.md:24,40-41,53-55` with upstream's (its configure
has no shared libraries for this host); whether to carry a `configure.ac` hunk for them is the
owner's call, not part of this task. Correct the reason in `gmoduleconf.h:2`, Wine's
`README.md:431-433` and GTK's `README.md:41`.

## Done when

Lean's interpreter finds its symbols through `dlsym` with no generated table and the lean demo
test passes, or the README says what still fails and why; rustc runs upstream's threaded codegen
and the rust and codex demo tests pass, with the build times recorded here; OCaml's script and
README give upstream's reason for having no stub libraries.
