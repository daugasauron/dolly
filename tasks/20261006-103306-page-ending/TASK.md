# The page says nothing when an image's last process ends

- STATUS: CLOSED
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

## The notice lost the signal some of the time (2026-10-06 night, `fix/ending-flake`)

`test/ending-browser.mjs` passed 6 of 8 runs on `integrate/next`: Ctrl+C on a
script looping over builtins sometimes read "exited with status 130" where it
should name `SIGINT`.

### Cause

"The signal without a kernel change" above was the cause. The supervisor
rebuilt the signal from the exit request it had seen
(`src/process-supervisor.mjs`, `#finish` and `process.asked`, from
`245efbec`). Two endings pass no request through it, because the kernel ends
the process itself (`src/process-kernel.c:2131-2133`, `dolly_process_signal`):
a signal that arrives before the program has entered (the process is still
`PENDING`: its Worker has not reported `started`), and `SIGKILL`. The
supervisor's forced exit that follows (`#deliverSignal`, then `#forceExit`) is
refused with `EINVAL`, since the process has already exited, so it recorded
nothing and resolved signal 0 with the kernel's status 130.

The kernel's own record was right all along (`exit_signal`, which `wait`
reads): what `docs/process-model.md` promises of wait records held. Slop and
libc always name the signal (`raise` with the default action sends the exit
request `{130, SIGINT}`); nothing of the concurrent-pipelines work is
involved. The test is right: the page offers Ctrl+C from the moment the
foreground is published (`refresh_foreground` publishes a `PENDING` process as
interruptible), which is before entry.

### Measured (runtime `dccf70f9…`, machine loaded: load average 10 to 19)

One page per round, the looping script as ENTRY
(`build/ending-evidence/probe-rate.mjs`); wrong means "exited with status":

| When the key arrives | Chromium | Firefox |
| --- | --- | --- |
| as the suite presses it (first sight of an interruptible foreground) | 5 of 18 wrong | 10 of 15 wrong |
| from inside the page, the moment the foreground is published | 4 of 18 wrong | 15 of 15 wrong |
| 1.5 s later | 0 of 10 wrong | 0 of 15 wrong |
| no key: the script sends itself `SIGKILL` | 18 of 18 wrong | 15 of 15 wrong |

With the supervisor logging each delivery (16 rounds, Chromium): every wrong
round was delivered with `started=false` and its forced exit refused (-28,
`EINVAL`); every right round with `started=true` and no forced exit.

Load matters only through that window: the later the Worker reports
`started`, the more keys land before it. An idle run was not possible (the
catalog was building); the 1.5 s row is the same measurement with the window
closed.

### Fix (`9284c0e5`)

`dolly_process_collect` returns the kernel's record: the status and, above its
byte, the signal. The supervisor's copy (`asked`) is deleted: 18 lines out, 11
in. Kernel and page only: the image inputs stay `4431ea80…`, so no image is
rebuilt (runtime `f6c5622e…`).

The suite gains the deterministic case, a script that sends itself `SIGKILL`:
it read "exited with status 137" on the old runtime, every time.

### Verified (runtime `f6c5622e…`, load average 7 to 19)

- The same probe, 15 rounds of each row in each browser: 120 of 120 name the
  signal (`SIGINT`, and `SIGKILL` for the last row).
- `test/ending-browser.mjs` fails on the old runtime at the new case and
  passes on the new one; `ending`, `core`, `process`, `terminal`, `shell` and
  `slop` pass in Chromium and Firefox.
- Source suite 400 of 400; `test/*.artifacts.mjs` 20 of 20 (the kernel's
  exports are unchanged).

To merge: `git merge fix/ending-flake` (it shares no file with
`core/kernel-boundary-step2`), then `npm run build:runtime`; the image inputs
do not move, so no image is rebuilt.

## Closed 2026-10-07

`fix/page-ending` (`245efbec`) is in the candidate; the signal fix of
`fix/ending-flake` went in as the cherry-pick `f82289ea` (the kernel's record
is read; the supervisor's copy is gone). `test/ending-browser.mjs` (exit
status, a trapping ENTRY, Ctrl+C as `SIGINT`, the self-`SIGKILL` case) passed
in Chromium and Firefox in every run after that commit
(`work/next/build/next-evidence/browser-f`, `-g`, `-h` summaries) and in the
main round's full browser pass (`round-3.log`, 826 s). The missing-ENTRY
case reads `failed: cannot start …` through the same notice
(`20261006-103256-entry-missing`). `docs/browser-boundary.md` has the
"Image ending" row.
