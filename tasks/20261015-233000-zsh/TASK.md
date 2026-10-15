# zsh, ported to spawn

- STATUS: CLOSED
- PRIORITY: 75
- TAGS: demo

Owner (2026-10-15): "finish ghostty in X11. Once that is confirmed working, I
want you to start porting zsh. Patch it to use spawn instead of fork."

Done when the `zsh` package builds in a round and
`demos/zsh/test/zsh-browser.mjs` passes in Chrome and Firefox.

## Closed (2026-10-16, 05:30)

The `zsh` package builds in a round (`demos/zsh/`, on `integrate/ghostty`)
and `demos/zsh/test/zsh-browser.mjs` passes in Chromium and Firefox. Evidence:
`work/evidence-2026-10-16/zsh/`.

- A spawned zsh (a function or builtin in a pipeline, `( ... )`, `$(...)`) is
  given what a forked child has: the shell writes its parameters, functions,
  aliases and options to a file, as `typeset -p`, `functions`, `alias -L`
  and `setopt` print them, and the new zsh sources and removes it before its
  code (`Src/init.c`). Before, `$(func)` found no function and `$(... $var)`
  no unexported variable. With `compinit` loaded (80 KB of state) a `$(...)`
  took 14 ms in Chromium, 10 ms without.
- zsh asks for `_GNU_SOURCE` only on Linux and musl; Dolly's libc now has
  `setresuid` and `setresgid` (declared under it): configure and Dolly's
  build define it, and zsh uses them.
- The Tab seen once: zsh's `LIST_AMBIGUOUS` (on by default) inserts the
  common prefix at the first Tab and lists at the second, with and without
  `compinit`. Not a defect.

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
