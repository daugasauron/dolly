# Emacs

GNU Emacs 31.1 for the terminal, compiled inside Dolly from the pinned release.

## Images

- `emacs`: the Emacs package; `INSTALL` it into any image.
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
  (`wasm64-unknown-emscripten`) and builds Emacs's own termcap without PTYs.
  Under `DOLLY` it skips what Dolly lacks: the versioned hard link, a spawn
  session, job-control wait options, `FIONREAD`, the terminal's interrupt key
  (`C-c` is fixed, so Emacs reads `C-g` as input) and process groups.
- [`Dollyfile-emacs`](Dollyfile-emacs): builds at `-O0`, dumps with pdumper,
  installs, and checks files, processes, timers and the collector.

## Limits

- The release's byte-compiled Lisp is used as shipped: bootstrapping it from
  source overflows the browser Worker's stack while interpreting loadup.
- `-O0` keeps C locals in linear memory, where the conservative collector scans
  the stack; Wasm locals are invisible to it, and an `-O2` build crashes.
- `C-g` cannot stop Lisp that makes no system call: Dolly runs signal handlers
  only at system calls.
- `M-x shell` fails: Slop has no `-i` and reads piped input to the end first.
- No PTYs, network processes, `emacsclient`, Lisp threads, or installed Lisp
  sources for compiled files (Dolly's `gzip` cannot compress them).

Test: `npm run test:demos -- emacs` ([`test/`](test/)).
