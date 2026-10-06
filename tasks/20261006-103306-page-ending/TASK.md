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

## Decision (2026-10-06, `fix/page-ending`)

- The shell (`src/browser.mjs`) owns the ending. It is the end of the image's
  ENTRY process, a fact of the runtime that exists with or without a display,
  and the shell already owns the other states of the page (`loading`,
  `ready`, `failed`, the bootstrap log), terminates the Worker and lets go of
  the modules. The display owns one thing: what it published last stays on
  its canvas (`dispose` paints once more).
- The notice is a page element the shell creates when the image has ended
  (`#image-ended`, `role="alert"`), in a strip of its own below the display:
  the display gives up that height and keeps its frame in proportion, so
  nothing the program drew is covered and no guest frame reaches the text.
  It is not one of the corner indicators and nothing hides it. A running
  program can draw a lookalike in its own frames; it cannot cover, change or
  remove the notice (`docs/browser-boundary.md`, "Image ending").
- What it says: `exited with status N`, `was ended by SIGNAME`, or `failed:`
  and one line (printable ASCII, 512 bytes); the stack goes to the console of
  the runtime Worker. Then "Reload to start again", focused, so Enter
  restarts. A module may add a link through `ended()` (`host/README.md`):
  `snapshot@0` offers the session the tab saved or restored. The shell names
  no module.
- A root process that fails or cannot start is the image's ending, not the
  runtime's failure: the Worker posts `exited` with `failure`, and the page's
  FATAL screen stays for the kernel, the supervisor and the modules. An ENTRY
  program that is missing reads `failed: cannot start /usr/bin/NAME: ENOENT`;
  one behind `/bin/foreground` shows `foreground`'s own line, now painted, and
  status 127 (`20261006-103256-entry-missing`).
- The signal without a kernel change: `dolly_process_collect` returns only
  the status. The supervisor keeps the ending the kernel last accepted (the
  EXIT packet, or its own forced exit) and resolves `{ status, signal }`: the
  signal the request named, or `status - 128` when the kernel replaced the
  status the program asked for with a pending signal. `exit(130)` stays an
  exit status.
- The last output: the supervisor services the modules once more before a
  root process resolves, so the display presents what the program wrote, and
  the page paints that frame before it stops presenting.

## State: written, not yet run in a browser

The machine was rebooted for memory on 2026-10-06 and browser runs were
suspended. Run without a browser, each inside
`systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0`:
`node --test 'test/*.test.mjs'` (256 pass; 4 fail to import `dist/`, which
this source-only worktree lacks: `image-build-service`, `process-abi`,
`system-snapshot-format`, `terminal-ring`), `node --test
'demos/**/*.test.mjs'` (83 pass) and `node scripts/lint-dollyfiles.mjs` (61
recipes). Logs: `work/spawn/build/ending-evidence/`.

To verify, once the catalog is built in `work/round2`:

    bash /home/daug/dev/dolly/work/setup-worktree.sh ending fix/page-ending-verify fix/page-ending /home/daug/dev/dolly/work/round2
    cd /home/daug/dev/dolly/work/ending && unset DISPLAY
    npm run build:runtime    # its image inputs hash must equal round2's
    cap="systemd-run --user --scope -q -p MemoryMax=6G -p MemorySwapMax=0"
    $cap node --test 'test/*.test.mjs'
    for t in ending core terminal display boundary custom-session host-compute process minimal; do
      $cap node test/$t-browser.mjs chromium firefox || echo "FAILED $t"
    done

`test/ending-browser.mjs` is new: `exit 7` at `system`'s shell (status and the
reload link), Ctrl+C on a looping script as ENTRY (SIGINT), and a trapping C
program as ENTRY (the engine's reason, no FATAL). Also to look at by eye: the
last output above the notice, and the notice with a saved session.
