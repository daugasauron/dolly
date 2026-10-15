# zsh

zsh 5.9.2 from upstream's release, compiled inside Dolly, as the `zsh`
package: `amy install zsh`, then `zsh`. Its line editor, completion system
(`autoload -Uz compinit; compinit`) and prompts work at the display's
terminal.

## Images

- `zsh`: the Z shell, with its line editor, completion system and prompt themes, a package.

## The port

Dolly has no `fork` or `exec`: a program starts by `posix_spawn`
([process model](../../docs/process-model.md#spawn-and-wait)).
[`zsh-dolly.patch`](zsh-dolly.patch) changes `Src/exec.c`, where zsh forks,
and `Src/init.c`:

- A program is spawned from the shell itself. Its redirections, pipe ends
  and assignments are made in the shell and undone after the spawn, as zsh
  does for a builtin; the program's pid joins the job, and zsh waits for it
  as for a forked child. Descriptors the forked child would have closed
  before `exec` are close-on-exec.
- `exec`, and the last command of `zsh -c`, spawn the program, wait for it
  and exit with its status.
- Shell code that needs a process of its own runs in a new zsh: a builtin or
  function in a pipeline before its end or in the background (its words
  expanded, a function with its definition), a `( ... )` subshell, `$(...)`.
  It is given what a forked child has of the shell: the shell writes its
  parameters, functions, aliases and options to a file, as `typeset -p`,
  `functions`, `alias -L` and `setopt` print them, and the new zsh sources
  and removes it before the code. With `compinit`'s state (80 KB), a
  `$(...)` took 14 ms in Chromium, against 10 ms without it (2026-10-16).
- Not available: `<(...)`, `>(...)` and `=(...)`, multios (`> a > b`), and
  job control (Dolly has no process groups). `time` reports elapsed time
  only: Dolly's `wait` reports no resource usage.

zsh calls its hooks, builtins and callbacks through function pointers of a
common type, which a WebAssembly call traps on: the program is linked with
`cc --dolly-cast-emulation` (Binaryen's `--fpcast-emu`, the `binaryen`
package).

## Building

[`prepare-zsh.sh`](prepare-zsh.sh) configures the release and generates
zsh's headers outside Dolly, in the pinned Emscripten container, as Emacs is
configured (a bootstrap exception): zsh's build runs awk and sh scripts
between its compiles. Where Dolly and Emscripten's libc differ, the script
states the result. Dolly compiles every object
([`Dollyfile-zsh`](Dollyfile-zsh)) and checks what a fork did, by spawn.

What zsh needed from Dolly's core: `sigsuspend` and `waitpid` with
`WCONTINUED` in libc, and the `ICRNL` and `INLCR` its line editor sets on its
terminal. libterminfo's `tputs` calls its output function as it is
([`Dollyfile-libterminfo`](../tmux/Dollyfile-libterminfo)).
