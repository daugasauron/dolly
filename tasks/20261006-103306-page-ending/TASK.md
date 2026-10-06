# The page says nothing when an image's last process ends

- STATUS: OPEN
- PRIORITY: 300
- TAGS: core,page,ux

Measured in `20261005-222449-single-program-images` (release build
`5439ebe7`, headless Chrome, 2026-10-06). Every runnable image has it.

## Reproduce

- `minimal`: type `exit`. `default`: `exit` twice (the first brings the
  recovery shell). The terminal freezes with a cursor,
  `data-dolly-status="exited"`, no message; keys do nothing.
- A custom image whose ENTRY is a program: the same when it exits, and its
  last output is never painted. Ctrl+C with the default action ends it the
  same way. A trap or `abort()` shows the page's FATAL screen with a
  JavaScript stack of the supervisor.

## Cause

All of it is page code:

- on `exited` the page terminates the Worker and drops the status
  (`src/browser.mjs:127-130`, `src/runtime-worker.mjs:368-369`);
- a failure of the root process rejects into the page's fatal path
  (`src/process-supervisor.mjs:645-649`, `src/browser.mjs:131-132`), while a
  child's failure is one line on its own stderr;
- the display stops presenting before the last frame is painted
  (`host/display/display.mjs`, `dispose`).

## Done when

- When the ENTRY process ends, the page states in its own text, over the
  display, that the image has ended and how (exit status, signal, or one
  line for a failure with the stack in the console), and what the user can
  do: reload to start again, or open the session this tab saved.
- The program's last output stays on screen.
- No ABI, kernel or seed change; `docs/browser-boundary.md` names the
  crossing.
- A browser test covers exit, a trapping ENTRY and Ctrl+C in Chrome and
  Firefox.
