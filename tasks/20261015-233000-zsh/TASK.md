# zsh, ported to spawn

- STATUS: OPEN
- PRIORITY: 75
- TAGS: demo

Owner (2026-10-15): "finish ghostty in X11. Once that is confirmed working, I
want you to start porting zsh. Patch it to use spawn instead of fork."

Done when the `zsh` package builds in a round and
`demos/zsh/test/zsh-browser.mjs` passes in Chrome and Firefox.

## State (2026-10-15, 23:50)

Ported and run in sessions; committed unbuilt. `demo/zsh` (`1c868cb3`, on
`demo/gtk`): the package, `zsh-dolly.patch` (spawn, `Src/exec.c` only), the
outside configure, the test; `4180251c`: libterminfo's `tputs`. Core, on
`core/gtk-seed`: `7e895970` (`sigsuspend`, `waitpid` with `WCONTINUED`),
`e4c637b8` (`ICRNL`/`INLCR` at the terminal and on ptys).

Left: a round on a seed with `core/gtk-seed` and `demo/gtk` (the binaryen
package, `cc --dolly-cast-emulation`) builds the package and runs its test.
Seen once, unexplained: after an ambiguous Tab zsh completed the common
prefix but showed no list of candidates within twelve seconds.

## What the sessions showed (2026-10-15, 21:30-23:45)

Probes in `tools-build` with `libterminfo` (driver
`scratchpad/repl.mjs`; evidence `work/evidence-2026-10-15/zsh/`):

- Unpatched: every pipeline fails ("fork failed: function not
  implemented"), and the last command of `zsh -c` fails at `execve`.
- Patched: fourteen checks pass (programs, pipelines through builtins,
  `$(...)`, prefix assignments that stay out of the shell, redirections,
  `&` and `wait`, a function in a pipeline, a subshell's `cd`, a loop piped,
  `exec`, `... | while read` in the shell). A missing command needed
  zsh's error flag cleared in the shell, where the fork's child had it.
- The link lacked `sigsuspend`; zsh's `wait3` asks for resource usage and
  its `waitpid` for `WCONTINUED`, both refused (`ENOTSUP`): configure now
  states `wait3` absent, and libc takes `WCONTINUED`.
- Interactive zsh trapped on calls through mismatched function pointers:
  first libterminfo's `tputs`, then zsh's own hooks (`runhookdef`). With
  `wasm-opt --fpcast-emu` (32 parameters) it runs.
- zsh's line editor sets `ICRNL | INLCR`; Dolly refused the whole
  `tcsetattr`, so every line showed twice. Without those two flags (probe)
  the editor works; Dolly's terminal now implements them.
- Tab completion works with zsh's own completion and with `compinit` (1849
  completions): a unique path completes, an ambiguous one to its prefix.
  Playwright's `keyboard.type("\t")` sends no Tab; `keyboard.press("Tab")`
  does.
- A probe session ended whenever a scripted `exit` reached Slop instead of
  a zsh that had failed to start: zsh's own `TMOUT` ends it in tests.
