# Ctrl+C during QuickJS startup exits 1 instead of 130

- STATUS: OPEN
- PRIORITY: 140
- TAGS: bug,javascript,demo,lifecycle

Under load, Ctrl+C sent right after `qjs` starts arrived while it created its
context: `qjs: could not create context`, status 1
(`build/evidence/demos-early.log`, 2026-10-01). The interrupt handler aborts
context setup, and `demos/javascript/quickjs-main.c` reports every failure there
as its own error. The demo test now waits for the loop to print before pressing
Ctrl+C, so it tests the loop, not the startup race.

Done when: an interrupted startup exits through `dolly_exit_signal(SIGINT)` (status
130), shown by a test that presses Ctrl+C before the context exists.

## Progress (2026-10-01)

`quickjs-main.c` now calls `dolly_exit_signal(SIGINT)` when context setup fails
after an interrupt (status 130 instead of "could not create context", 1).
Not yet tested: pressing Ctrl+C right after submitting `qjs` is racy under
ISIG. While Slop is still launching the command, the interrupt targets the
shell, not the not-yet-running child, and `__dolly.foregroundPid` stays the
interactive shell's pid while it runs `qjs`, so the test cannot wait for the
child. A deterministic test needs a way to observe the running child.
