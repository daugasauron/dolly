# xterm -version and -help exit 129 and start a shell on a terminal nobody reads

- STATUS: CLOSED
- PRIORITY: 130
- TAGS: audit,recipes,x11,bug,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`): every package `amy` offers installed alone into a fresh `default` session.

## State (2026-11-17)

Fixed on `ws/recipes` (f66240630, e0a758dfd), as Do says, and one cause more than Found read from
the code: `xterm-pty.c` reads the window id until xterm writes its line or the master closes;
with no line, xterm has ended without a window (`-version`, `-help`, a bad option, no display),
and the launcher closes the slave, waits for xterm and returns its status, starting no program.
Built and run, that alone still ended with 129: closing the master is SIGHUP to whoever holds the
slave (`host/pty/dolly-pty-0.wat`), the launcher among them while it reads, so it was the
launcher that SIGHUP ended. It now ignores SIGHUP, and starts xterm and the program with SIGHUP's
default (`POSIX_SPAWN_SETSIGDEF`). Rebuilds xterm, x11-desktop and the images that install xterm.

Built in `work/recipes`; in a fresh `default` session after `amy install xterm`, Chromium and
Firefox (case `xterm-status`, `work/audit-1116-evidence/recipes/ws-recipes/logs/cases2-*.jsonl`):
`xterm -version` prints `XTerm(412)` and exits 0, `xterm -help` prints the usage and exits 0,
`xterm -bogus` says `bad command line option "-bogus"` and exits 1.
`demos/x11/test/x11-browser.mjs`, whose twm menu starts another xterm and whose xterm runs amy and
tmux, passed on the rebuilt x11-desktop in both (43.1 s, 48.1 s;
`logs/a2-x11.log`).

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

## Closed (2026-11-17)

The Done-when holds on `ws/recipes`'s build of the fixed launcher, as the State says: `xterm
-version` prints `XTerm(412)` and exits 0, `xterm -bogus` exits 1, and `x11-browser`'s xterm steps
pass, in Chromium and Firefox. The 0.1.8 round rebuilds xterm with the catalog.
