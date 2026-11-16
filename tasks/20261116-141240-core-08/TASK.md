# The supervisor and the process Worker address their shared control block by bare word numbers, 23 times in two files

- STATUS: OPEN
- PRIORITY: 60
- TAGS: audit,core,cleanup,0.1.8

From the core audit of 2026-11-16 (`work/audit-1116`, source of `b09b1e243`).

## State (2026-11-16)

Found by reading; nothing changed. Page JavaScript only: no image rebuild.

## Found

Each process thread has a 32-byte `SharedArrayBuffer` the supervisor and its Worker share
(`page/process-supervisor.mjs:628-641`): word 0 the call sequence, 1 the answered sequence, 2 and
3 the result's halves, 4 the copy word, 5 a thread's start word. The layout is written once, in
a comment, and used as `Atomics.*(control, N, ...)` 12 times in `process-supervisor.mjs` and 11
in `process-worker.mjs` (`grep -cE 'control, [0-9]'`); the readers explain a number in a comment
where they use it ("control word 5", "control word 4"). AGENTS.md's Zen: "Good code documents
itself, extract functions and use variable names"; "Write grepable code": a grep for the start
word finds comments, not uses. It is trusted JavaScript on both sides, not a contract, so this is
naming only.

Beside it, threads@0's limits are literals in three places that do not say they are one rule:
`host/threads/threads.mjs:40` (`< 64` Workers, `< 32` a process), the manifest's `gives` ("32 a
process, 64 in all") and the review map; the kernel's table holds 64 a process
(`host/threads/kernel.c:12`), so the host's 32 is the limit a program meets. That the 32 and 64
are the host's own, not contract, is decided (`a53be9e97`, `docs/process-model.md`, for Donna).

## Do

Name the six words once, in a module both files import (not `page/process-constants.mjs`, which
is generated from `process.h`; the supervisor exports them, or a small `page/process-control.mjs`),
and use the names; name threads@0's two limits once in `threads.mjs`.

## Done when

`grep -cE 'control, [0-9]' page/process-supervisor.mjs page/process-worker.mjs` prints 0 and 0;
the process, threads and ended-worker suites pass in Chromium and Firefox.
