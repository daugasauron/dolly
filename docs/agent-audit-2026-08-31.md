# Pi agent workload audit, 2026-08-31

This audit used upstream Pi inside a fresh Dolly browser session with
`deepseek/deepseek-v4-flash-0731` through the normal OpenRouter HTTP broker.
The temporary credential was supplied only to the ephemeral in-Wasm session;
it is not part of source, snapshots, or this report.

## Baseline

The first broad task exposed practical shell-tool gaps rather than a need for a
larger host API. One turn took 60.6 seconds and 20 model requests; a follow-up
loop reached 69 requests and the six-minute harness limit. The agent observed
missing or incompatible `ls -la`, `file`, `stat`, `[`, compiler warning flags,
`mv`, `printf`, negated tests, and same-line `$?`. A later command accidentally
ran `cat` with Pi's live terminal as stdin and waited indefinitely. Terminal
animation produced 17,526 published frames during the original run.

Raw `nc`/socket compatibility was deliberately rejected: it would contradict
Dolly's one brokered HTTP edge rather than repair an agent workflow.

## Changes driven by the workload

- Expanded the separately compiled `/bin/ls` and added separately compiled
  `/bin/file`, `/bin/stat`, `/bin/test`, `/bin/[`, and `/bin/mv`.
- Added source-built sbase `/bin/printf`; accepted ordinary compiler
  `-pedantic` and warning flags.
- Made `$?` expand per simple command and preserved `!` as a test argument when
  it is not at a shell command boundary.
- Gave Pi shell calls a finite empty stdin spool, so accidental readers see EOF
  instead of consuming the TUI.
- Added a 60-second inherited in-Wasm spawn deadline. Instrumented loops unwind
  with status 124; Ctrl-C remains status 130 and the session survives.
- Coalesced terminal rendering at input boundaries and cached ASCII glyphs.
  Subsequent Pi audits published roughly 3,900–4,700 frames instead of 17,526.
- Added the explicit download tool so a useful artifact can leave disposable
  WasmFS only when requested.

## Focused result

The final focused agent task finished in 111.2 seconds with five model
requests. It
created `/workspace/smoke`, compiled and ran a C program with Make, initialized
and committed it with Git, and exercised the intended command set. The model's
own conclusions were that the C→Make→run and Git loop is already the essential
core; dependency-free QuickJS scripts are useful; and agents should prefer
portable command forms over probing every utility with GNU `--version`.

The final run reproduced two gaps: no `if`/`then`/`fi` block syntax in Slop and
no `cp` on `PATH`. It recommended those as the highest-value compatibility
extensions. Dolly now builds a separately compiled `/bin/cp` with file,
symlink, multiple-operand, and recursive-directory behavior but deliberately
no ownership or permission preservation. Shell blocks remain the next larger
language decision. Earlier runs also observed low-impact GNU `--version`
differences in `file`, `stat`, `wc`, and `sed`; the underlying operations
worked.

After `/quit`, independent recovery-shell probes confirmed a clean Git status,
`make clean all`, and successful execution of the rebuilt program. The harness
tracks the command result-sequence mailbox directly, so a multi-minute Pi turn
cannot outlive a 60-second browser convenience promise and hide its eventual
exit. The model-generated report is retained as a build artifact during
development, not as a runtime communication channel.

## Gamedev workload

A separate gamedev audit asked Pi to create and commit a finite-frame C game
using the direct display lease. The first attempt exposed that the image built
`graphics-demo.c` but did not retain it; a later provider failure prevented the
agent from recovering. The gamedev Dollyfile now retains that source and its
Makefile as ordinary in-Wasm starter files.

The final run completed in 141.5 seconds and five model requests. It produced a
C game and Makefile, compiled them inside Dolly, committed the sources, ran
three frames, released the framebuffer, and returned to Slop. Expected-status
probes independently cleaned and checked Git, rebuilt the program, ran the
finite frame count, and read both audit files. No runtime or tool failure was
reproduced.

The agent's useful next request was game-test infrastructure: inject semantic
key/pointer events under test and capture deterministic frames for pixel or
golden-image assertions. Its request for stride/capacity introspection is
already satisfied by `dolly_display_frame`; this is a good example of why
observations should be checked against the typed contract before adding an API.

## Next compatibility probes

The best next additions should be justified by another real task. Current
candidates are recursive grep (`grep -r/-n`), `command -v`, shell loops and
conditionals (beginning with `if`), and here-documents. The lifecycle priority
is an outer trusted worker deadline/replacement path for arbitrary foreign Wasm
without Dolly safepoints. None of these requires multiprocessing, raw sockets,
a host shell, or a host filesystem.
