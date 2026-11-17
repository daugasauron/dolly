# Port patches carry hunks the core made unnecessary: LLVM's executable path in three builds, DarkPlaces's file lock, Make's amalgamation, OCaml's spawn, Codex's single thread, Lean's spawn signals, Emacs's host-made makefile

- STATUS: OPEN
- PRIORITY: 150
- TAGS: audit,ports,rust,mojo,zig,xonotic,ocaml,codex,lean,emacs,cleanup,0.1.8

## State (2026-11-17)

Every hunk below is gone on `ws/ports`, with what each needed, and three more found on the way
(DarkPlaces's `select`, read loop and `SUPPORTDLL` hunks; Emacs's wait options). What a build in
this tree proved, and what only the round can (the heavy chains):

1. LLVM's main executable: `llvm-main-executable.patch`, its rows in `rust-llvm` and `mojo-llvm`,
   their staging and licence sources are gone: LLVM finds its executable by `dladdr`, which in
   Dolly names the running program (item 2); `rust-llvm` checks that `llvm-config --prefix`,
   run from `/tmp`, prints `/opt/rust-llvm`. Round: `rust-llvm` (that check) and `mojo-llvm`
   build, and the rust and mojo tests pass.
2. Zig's `GetExecutablePath` fallback is gone; the patch applies to the prepared tree
   (`patch --dry-run`). On a Unix that is not Linux, LLVM's `getMainExecutable` asks `dladdr`
   (`llvm/lib/Support/Unix/Path.inc`), and Dolly's names the running program
   (`process/libc-adapter.c:1821`), as for item 1. Round: `zig-llvm-build`, and the zig test, whose `zig cc` starts its
   assembler (`-cc1as`) by the path LLVM finds.
3. DarkPlaces keeps only its loopback hunk (`netconn.c`: Dolly has no IP sockets); its
   `select`, session lock, file reads and `dlopen` (which fails: the engine is no host of
   shared objects) are upstream's. `xonotic-build` and `xonotic` build in this tree, and the
   xonotic test passes in Chromium (`both-15`: the menu, its sound, a bot match on stormkeep);
   its Firefox run was refused once `rust-sdk`'s pin changed under it (naga is in its closure),
   so the round runs it.
4. Make: the 16 `#pragma once` hunks and `load_too_high` are gone. Staged, the prepared tree
   holds no pragma and no `__dolly__` in `load_too_high`.
5. OCaml's `addclose` hunk is gone (and the README's bullet that described it): Dolly's spawn
   takes the close action (`process/runtime-adapter.c`, `FDOP_CLOSE`). `ocaml` builds in this
   tree, and the ocaml test (`Unix.create_process` over a pipe among it) and its fixpoint
   (`make bootstrap` in a session) pass in Chromium and Firefox (`both-7`).
6. Codex: `device-login.patch`, `filesystem-walk.patch` and `sqlx-sqlite.patch` are gone (the
   blocking pool, the non-blocking log writer and SQLite's worker thread are upstream's).
   Round: `codex` builds, and the codex test (its sign-in included) passes.
7. Lean's spawn takes no signal attributes: the child keeps what Lean ignores and blocks, as a
   forked one does (README). Round: the Lean chain and the lean test.
8. Emacs: `prepare-emacs.sh` no longer makes `src/lisp.mk` on the host; the release's `.elc`
   files are not staged and the recipe runs upstream's bootstrap
   (`tasks/20261116-143518-ports-08`); `process.c`'s hunk that passed no wait options is gone
   (Dolly's `waitpid` takes `WUNTRACED` and `WCONTINUED`, `process/runtime-adapter.c:320`). The
   terminal hunks stay, with their real reason in the patch and README: Emacs's `terminfo.c`
   declares `tparm` variadic, and NetBSD's libterminfo defines it with nine `long`s, which a
   WebAssembly call cannot match. `emacs` and `gnu-emacs` build in this tree, the recipe's check
   of an asynchronous child's exit status among it, and the emacs test passes in Chromium and
   Firefox (`cc-6`, `both-9`).

The SDL2, RTS and Wine READMEs (and `icall.c`) no longer name a limit that is gone: SDL is built
without threads by choice, and `cc --dolly-cast-emulation` exists, which `icall` is preferred to
for touching only the GIMP modules' calls.

Images the change rebuilds: every image (Make is in `system-build`); by item, beyond that,
`rust-llvm`, `mojo-llvm` and what they build (1), `zig-llvm-build` and after (2), `xonotic-build`
and `xonotic` (3), `ocaml` (5), `codex` (6), the four Lean images (7), `emacs` and `gnu-emacs` (8),
`wine-build` and `wine` (`icall.c`).

## What

AGENTS.md: "Prefer unchanged upstream source plus target/toolchain configuration over source
forks and per-program compatibility patches." These hunks were written when the core lacked
something it now has, and each says so in a comment that is no longer true.

1. **LLVM's main executable, `rust-llvm` and `mojo-llvm`.**
   `demos/rust/config/patches/llvm-main-executable.patch` makes `getMainExecutable` take the
   program's path from `argv[0]` "as OpenBSD's does" (`|| defined(__dolly__)` in
   `llvm/lib/Support/Unix/Path.inc`). `demos/rust/Dollyfile-rust-llvm:35-38` ("Dolly has no
   /proc/self/exe, so it finds itself as OpenBSD's does") and `demos/mojo/Dollyfile-mojo-llvm:38-40`
   ("As demos/rust: Dolly has no /proc/self/exe") apply it; `demos/rust/prepare-sources.sh:13` and
   `demos/mojo/prepare-sources.sh:37` stage it, `config/upstreams.json` lists it twice.
   Dolly answers `readlink("/proc/self/exe")` (`kernel/process-kernel.c:1256-1261`,
   `docs/process-model.md:41`), and since `9b8626d02` (2026-10-24) the process libc's `dladdr`
   names the program for its own functions (`process/libc-adapter.c:1821-1840`). Upstream LLVM, on
   an OS it does not list, falls through to `#elif defined(HAVE_DLOPEN)` and asks `dladdr`
   (Mojo's LLVM `4154b56c`: `Path.inc:329`); that commit removed the same workaround from
   `demos/llvm/Dollyfile-llvm` and `demos/zig/Dollyfile-zig-llvm`, whose LLVMs 24 and 22.1.8 now
   build with upstream's code. Measured 2026-11-16 in Chromium on round 1117's `system` with the
   `llvm22` package (upstream 22.1.8 without this patch): `cd /tmp &&
   /usr/lib/llvm22/bin/llvm-config --prefix --bindir --version` prints `/usr/lib/llvm22`,
   `/usr/lib/llvm22/bin`, `22.1.8` (`work/audit-1116-evidence/ports/llvm22-probe.log`).
2. **Zig's driver, `zig-llvm-build`.** `demos/zig/zig-0.17.0-dolly-llvm.patch:230-234` falls back
   to `GetExecutablePath(Argv0)` "Where LLVM finds no path of its own (Dolly: Emscripten's libc has
   no dladdr)". It has had `dladdr` since the same commit, so the fallback no longer runs.
3. **DarkPlaces's file lock, `xonotic-build`.** `demos/xonotic/darkplaces-dolly.patch:75-77` sets
   `dolock = false` in `fs.c` ("Dolly has no file locks; the session lock stays an ordinary
   file") before DarkPlaces's `fcntl(handle, F_SETLK, ...)` whole-file lock. Dolly has had
   `flock` and `fcntl` byte-range locks in the kernel since `85a01262f` (2026-10-06, "Lock files in
   the kernel: flock and fcntl byte ranges"; `process/libc-adapter.c:1603-1690`). Measured
   2026-11-16 in Chromium on round 1117's `system` with `cc`: DarkPlaces's call, a whole-file
   `F_WRLCK` by `F_SETLK` on an `O_RDWR` file, returns 0, and its unlock 0
   (`work/audit-1116-evidence/ports/lock-probe.json`, `lock-probe.log`).
4. **GNU Make, `system-build` (core).** `config/make-dolly.patch` adds `#pragma once` to 16
   headers (80 of its 129 lines) for `src/runtimes/make-amalgamation-dolly.c`, which included
   Make's sources into one unit (`c4dbe3ad0`, 2026-09-03). Since `bb30b2224` (2026-11-03) Make is
   compiled from upstream's 34 source files as separate units (`Dollyfile-system-build:272-283`,
   `config/make-sources.txt`) and the amalgamation is gone; upstream builds those units without
   the pragmas. Measured 2026-11-16 in Chromium on round 1117's `system`: from the staged
   `make-4.4.1.tar` (13 of its headers carry the pragma), `system-build`'s own `cc` line gives
   the same `make` byte for byte with and without the 13 lines (sha256 `ce94f1f1…` both), and it
   runs a Makefile (`make-pragma.mjs`, `make-pragma.log` in `work/audit-1116-evidence/ports/`).
   The same patch's `load_too_high` hunk (`make-dolly.patch:17-23`: `#ifdef __dolly__ return
   0;`) makes `make -l N` ignore the limit silently; upstream (`src/job.c:2071`)
   returns 0 itself when no `-l` is given, and with one tries `/proc/loadavg`, then
   `getloadavg`, and on their failure warns once that it cannot enforce load limits on this
   system: the hunk turns an explicit unsupported result into silence. In a session
   `getloadavg(l, 1)` returns -1 (`lock-probe.log`), so upstream's warning is what Make would
   print; the staged `make -j2 -l 1` runs two jobs and says nothing (`make-pragma.log`), and the
   same sources with the hunk reverted to upstream's line print `make: cannot enforce load limits
   on this operating system` and run both jobs, status 0 (`make-load.mjs`, `make-load.log`).
5. **OCaml's spawn, `ocaml`.** `demos/ocaml/ocaml-dolly.patch:33-37` skips
   `posix_spawn_file_actions_addclose` in `otherlibs/unix/spawn.c` ("Dolly's spawn takes no close
   action: the child keeps [src] too"), so a child `Unix.create_process` redirects keeps the
   source descriptor open as well. The patch landed at 18:07 on 2026-10-23 (`3fe1f610a`); at 20:03
   the same day `ba5f2568e` ("... posix_spawn addclose") gave Dolly's spawn the close action
   (`process/runtime-adapter.c:475-560`, `FDOP_CLOSE`), and the core's Zig uses it
   (`config/zig-0.17.0-dolly-native.patch:130`). Measured 2026-11-16 in Chromium on round 1117's
   `system` with `cc`: a child spawned with descriptor 5 inherited writes through it (status 0);
   with `posix_spawn_file_actions_addclose(&actions, 5)`, which returns 0, its `echo >&5` fails
   (status 1) (`addclose-probe.json`, `addclose-probe.log` in `work/audit-1116-evidence/ports/`).
   The `ocaml` package leaks today: a program built with `ocamlc -custom -I +unix unix.cma` that
   runs `Unix.create_process "/bin/slop" [|...; "echo leaked >&3"|] Unix.stdin fd Unix.stderr`
   with `fd` = 3 finds `leaked` in the file, where upstream's child has descriptor 3 closed
   (`ocaml-probe.json`, `ocaml-probe.log`). The same program linked against the package's
   `libunixbyt.a` with its `spawn.b.o` replaced by the staged `spawn.c` without the hunk: the
   child's `echo leaked >&3` fails, "slop: 3: bad file descriptor", and only `to-stdout` reaches
   the file (`ocaml-spawn.mjs`, `ocaml-spawn.log`).
6. **Codex's no-worker-thread hunks, `codex`.** All ten `demos/codex/config/*.patch` date from
   the first port (`170bbdb1a`, 2026-09-09, "Fix Codex device sign-in on Dolly without worker
   threads"). Since `6ea13da27` (2026-10-01, "Run Codex on threads@0 like upstream") Codex runs
   upstream's multi-thread Tokio runtime and declares `threads@0`, and that commit removed
   `arg0.patch` and most of `tui-events.patch`; two patches still avoid worker threads on
   `target_os = "emscripten"`: `device-login.patch` (two `spawn_blocking` calls run inline, "needs
   no worker thread", and a non-blocking log writer replaced) and `filesystem-walk.patch` (the
   walk run inline with `yield_now` instead of on the blocking pool). Codex also applies
   `demos/rust/config/patches/sqlx-sqlite.patch` (`prepare-codex-sources.py:74`), which runs each
   SQLite connection's worker as a task ("a task on Emscripten, a thread elsewhere") instead of
   upstream's thread. Dolly has the threads: the rust demo's fixture
   `demos/rust/test/fixtures/rust/tokio/src/main.rs:39-60` runs a multi-thread Tokio runtime on a
   spawned thread, as Codex does, and its `tokio::fs` calls go through the blocking pool; it passed
   in round 1117 (`rust: chromium passed in 95.1s`). Not confirmed by a Codex build without the
   hunks (40.5 min). A change under `demos/rust/config/patches/` also changes the Rust seed's key
   (`tasks/20261116-142914-ports-07`).
   Not stale: `installation-id.patch` (upstream's `spawn_blocking` with `file.lock()` replaced by
   a read that fails when the file is absent, so `demos/codex/launch.c:61` writes the id first).
   Dolly has `flock` (`flock-probe.log`), but Rust's standard library implements `File::lock` only
   for the systems it lists, and Dolly's Rust is `target_os = "emscripten"`: in round 1117's
   `rust-tools`, a program calling `File::lock`, `unlock` and `try_lock` gets `lock() not supported
   (Unsupported)` for each (`rust-lock-probe.json`, `rust-lock-probe.log`). That hunk follows from
   the target (`tasks/20261116-141316-ports-06`), not from threads.
7. **Lean's spawn signals, `lean`.** `demos/lean/lean-dolly.patch:216-225` spawns every child with
   `POSIX_SPAWN_SETSIGMASK | POSIX_SPAWN_SETSIGDEF` and all signals reset, "as a Dolly child
   does: a forked one would keep the SIGPIPE Lean ignores" (README: "`posix_spawnp` refuses to
   imply" it). That was so before `d20e6e491` (2026-11-04, "Signals: the kernel knows each
   disposition; posix_spawn hands them on"; until then "posix_spawn from a program that ignores a
   signal failed with ENOTSUP"). Now a spawned child keeps the ignored signals as a forked and
   exec'd one does (measured: a program that ignores `SIGPIPE` and `posix_spawn`s itself with no
   attributes gets `spawn 0` and `child: SIGPIPE ignored`; `spawn-signals-probe.*`), so the reset
   only makes Lean's children differ from upstream's; the spawn itself stays (Dolly has no
   `fork`). Not rebuilt: Lean's chain is 75.8 min.
8. **Emacs's `src/lisp.mk`, `emacs`.** `demos/emacs/prepare-emacs.sh:67-69` makes it on the
   build host, in the Emscripten container: "Make re-executes itself after remaking an included
   makefile; Dolly has no exec" (2026-10-02). Exec came on 2026-10-23 (`ba5f2568e`). Measured in a
   `system` session: with `src/lisp.mk` removed from the staged tree, `make -C src temacs` prints
   `GEN /tmp/emacs/src/lisp.mk`, goes on to build `temacs`, status 0, and the fragment it made
   is byte for byte the host's (`emacs-reexec.mjs`, `emacs-reexec.log`). So the host step can go.
   `emacs-dolly.patch`'s two terminal hunks (`:19-29` for `configure.ac`, `:60-70` for
   `configure`: "Dolly has no terminfo library; use Emacs's termcap, as MS-DOS does", with
   `TERMCAP_OBJ="termcap.o tparam.o"` and `emacs_cv_tputs_lib='none required'` in
   `prepare-emacs.sh:57`) date from 2026-10-02; NetBSD's libterminfo became a package on
   2026-10-13 (`38f9faa65`, `demos/tmux/Dollyfile-libterminfo`), and zsh links it
   (`prepare-zsh.sh:40-42`). Not confirmed: an Emacs configured without these hunks, with the
   `libterminfo` package installed, was not built (it needs the host configure step rerun).

A stale reason rather than a stale hunk: SDL2 is built with `SDL_THREADS_DISABLED`
(`demos/sdl2/sdl2-dolly.patch:22`, "Thread creation remains unsupported", 2026-09-08), and
`demos/sdl2/README.md:20` ("Thread creation is unavailable", so `SDL_AddTimer` has no thread)
and `demos/rts/README.md:40` say so as Dolly's limit. Dolly has had threads since 2026-09-27
(`018c5f273`); a serial SDL is the port's choice, which AGENTS.md's "prefer simple serial
semantics" supports, and the two READMEs should say it is one.

Another: Wine's GIMP modules are rewritten by the demo's own `icall` tool (`demos/wine/icall.c`,
469 lines, and its run-time `port/icall.c`, 200; `module.mk:33-61`), because "Dolly's `cc` has no
pass that emulates such calls" (`demos/wine/README.md:185-186`, `icall.c:7`; 2026-10-10). Five
days later `cc` got one, `--dolly-cast-emulation` (`81fa288c5`, 2026-10-15; Binaryen's
`--fpcast-emu`, `docs/process-model.md:528-533`), which GLib's pkg-config file asks for and zsh
uses. Whether Wine can link with it instead is not measured: it would turn every indirect call of
the one `wine` program into a thunk call, where `icall` changes only the modules that set
`ICALL`; the README's sentence is false either way.

## Smallest fix

Delete `llvm-main-executable.patch` with its rows, staging lines and `upstreams.json` entries; the
`GetExecutablePath` hunk of `zig-0.17.0-dolly-llvm.patch`; the `dolock` hunk of
`darkplaces-dolly.patch`; the 16 `#pragma once` hunks and the `load_too_high` hunk of
`make-dolly.patch` (it changes `system-build`'s staged Make and so rebuilds the catalog: in the
next round that rebuilds it); the `addclose` hunk of `ocaml-dolly.patch`; the signal attributes
of `lean-dolly.patch`'s spawn; the host `lisp.mk` step of `prepare-emacs.sh`, and
`emacs-dolly.patch`'s terminal hunks if an Emacs over `libterminfo` passes the emacs test; the
false reasons in the SDL2, RTS and Wine READMEs; `device-login.patch`,
`filesystem-walk.patch` and `sqlx-sqlite.patch` from Codex's list, keeping what still fails
without them.

## Done when

`rust-llvm`, `mojo-llvm`, `zig-llvm-build`, `codex`, `ocaml`, `xonotic-build`, `emacs` and
`system-build` build without the hunks; `/opt/rust-llvm/bin/llvm-config --prefix` run from
another directory prints `/opt/rust-llvm`; `make -l 1` in a session prints Make's "cannot
enforce load limits" warning (or enforces the limit); Codex signs in; the rust, codex, mojo,
zig, ocaml, lean, emacs and xonotic demo tests pass; no README names a Dolly limit this task
found gone.
