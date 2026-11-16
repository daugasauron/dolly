# xterm -version and -help exit 129 and start a shell on a terminal nobody reads

- STATUS: OPEN
- PRIORITY: 130
- TAGS: audit,recipes,x11,bug,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`): every package `amy` offers installed alone into a fresh `default` session.

## State (2026-11-16)

Reproduced in Chrome on `work/round1113/dist/`; the cause is read from the source. Nothing changed
yet.

## Found

```
$ amy install xterm
$ xterm -version; echo $?
XTerm(412)
129
$ xterm -help > /dev/null 2>&1; echo $?
129
```

Upstream's xterm prints and exits 0 (xterm 412's `main.c:2497-2527`: `Version()` or `Help()`, then
`if (quit) exit(0)`). `/usr/bin/xterm` is Dolly's launcher
(`demos/x11/xterm-pty.c`): it opens a pseudo-terminal, starts upstream's xterm on the master,
waits to read the window id xterm writes, and then always starts the command or `$SHELL` on the
slave and returns that program's status (`xterm-pty.c:49-76`). When xterm exits without a window
(`-version`, `-help`, a bad option, no X server), the read ends at EOF with no id, the launcher
still starts `/bin/slop` on a terminal whose master is closed, and returns that shell's status:
129, 128 + SIGHUP's 1 (read from the code, not traced). xterm's own status is lost.

Evidence: `work/audit-1116-evidence/recipes/run-a.jsonl` (case `xterm`), `retry.jsonl`
(`xterm-debug`).

## Do

In `xterm-pty.c`: when no window id arrives, wait for xterm and return its status without starting
the program.

## Done when

`xterm -version` prints `XTerm(412)` and exits 0, `xterm -bogus` exits non-zero, and
`x11-browser`'s xterm steps pass.
