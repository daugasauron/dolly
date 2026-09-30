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
