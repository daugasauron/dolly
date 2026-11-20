# Emacs

GNU Emacs 31.1 for the terminal, compiled inside Dolly from the pinned release.

## Images

- `emacs`: `emacs`, GNU Emacs for the terminal, and `etags`.
- `gnu-emacs`: an application that opens straight into Emacs.

Open `/gnu-emacs/`; build with `npm run image -- gnu-emacs`. `C-x C-c` returns
to Slop and `emacs` reopens the editor. `M-!`, `M-x compile` and other process
commands run Slop through `posix_spawn` over pipes.

## Key files

- [`prepare-emacs.sh`](prepare-emacs.sh): applies the patch and runs the
  release's `configure` in the pinned Emscripten container, which has Dolly's
  libc headers; every object is compiled by Dolly
  ([bootstrap exceptions](../../docs/sources.md#bootstrap-exceptions)).
- [`emacs-dolly.patch`](emacs-dolly.patch): names the `dolly` system type
  (`wasm64-unknown-emscripten`) and builds Emacs's own termcap without PTYs
  (Emacs calls terminfo's `tparm` as variadic, which libterminfo's is not).
  Under `DOLLY` it skips what Dolly lacks: the versioned hard link, a spawn
  session and `FIONREAD`. `C-g` is the terminal's interrupt key, as Emacs
  sets it on any Unix (`VINTR`). It fixes one bug of the release: a terminal
  read stored inside `while-no-input` (eager completion at the first prompt)
  quit after two bytes and lost the rest. Its loadup leaves the dump's
  collection time and buffer display times out, and configure the build
  details, so that each build dumps the same bytes.
- [`Dollyfile-emacs`](Dollyfile-emacs): builds at `-O0` with the deeper stack
  (`dolly.process.stack`), compiles the release's Lisp sources by upstream's
  bootstrap (most of the build's time) in batches, each file seeing only the
  bytecode of the batches before its own, so that each build gives the same
  bytecode; dumps with pdumper, installs, and
  checks files, processes, timers, the installed Lisp sources and the
  collector.

## Limits

- `-O0` keeps C locals in linear memory, where the conservative collector scans
  the stack; Wasm locals are invisible to it, and an `-O2` build crashes.
- `C-g` cannot stop Lisp that makes no system call: Dolly runs signal handlers
  only at system calls.
- `M-x shell` fails: Slop has no `-i` and reads piped input to the end first.
- No PTYs, network processes, `emacsclient` or Lisp threads.

Test: `npm run test:demos -- emacs` ([`test/`](test/)).
