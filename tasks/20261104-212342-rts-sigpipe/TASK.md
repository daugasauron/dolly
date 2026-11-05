# rts-arena ended by SIGPIPE (status 141) once, in a match

- STATUS: CLOSED
- PRIORITY: 260
- TAGS: bug,signals,pipes,rts,0.1.5

## Closed (2026-11-05 12:25)

The writer was rts-arena, a janis program, which should have ignored SIGPIPE: Node does from its
start, and janis did not. Fixed on `fix/intermittent-1105`: e255a2997 (janis ignores SIGPIPE;
a failed write is its stream's `error`), aa97e635e (pins). Not a seed change. janis is a recipe:
the next round rebuilds janis and the 21 recipes on it (janis-install, typescript,
vendor-crates, pi, pi-dolly, pi-runtime, pi-agent, pi-minimal, pi-local, pi-phone, bhop, airtime,
classicube, classicube-agent, closed-source-agent, seven-kingdoms, rts-arena, slopyard-build,
slopyard-game, slopyard, dollyfile-studio).

The match itself never failed here: 0 of 160 short matches (`build/flaky-evidence/rts-loop.mjs`:
60 of 10 s and 60 of 25 s in Chromium, 40 of 25 s in Firefox), beside the candidate round's
builds and the Slopyard loops, with a supervisor trace (pid, parent, executable, each EPIPE
write and exit signal) that saw no EPIPE. Closed on the mechanism, measured in rts-arena's image
(`epipe-probe.mjs`): a janis parent writing a child's stdin while the child is ended by SIGTERM,
as rts-arena ends its Pi players, died of SIGPIPE in 25 of 40 single runs and in 10 of 10 rounds
of 20; after the fix 0 of 40, and 0 in 10 rounds of 20 in Chromium and in Firefox. Reopen if it
recurs.

- How: janis polls a child's stdin, then writes it (`pumpChildren`); a child that ends between
  the two makes the write fail with EPIPE, and libc's SIGPIPE ended the writer. 141 was
  rts-arena's own status (the shell's foreground command); its only pipe writes are its
  children's stdin (two Pi, two engines; the engines ignore SIGPIPE themselves).
- The fix, as Node and libuv: SIGPIPE ignored at start (`dolly_quickjs_embed`, so every janis
  program: janis, pi, rts-arena, bhop's and Slopyard's agents); children start at the default
  (runtime.h's spawns already did). The pump takes a write's EPIPE as the poll's hang-up (the
  stdin stream's `error`, which rts-arena handles); `process.stdout`/`stderr` report a failed
  write as `error`; `console` drops it, as Node's does (measured in Node 22).
- Test: `node-oracle.mjs` compares with Node a child whose stdout is closed (`console`, `writeSync`
  and `stdout.write`) and 20 children ended while their stdin is written: the second is the
  probe's case, which ended a janis parent in every round before.
- Verified on this tree's images (image inputs `b9e16e76`, the candidate's): `rts-browser.mjs`
  20 of 20 in a row in Chromium (270-325 s each, 40 matches); `rts-loop.mjs`, 25 s matches beside
  the Slopyard loops: 40 of 40 in Chromium, 50 of 50 in Firefox; `javascript-browser.mjs` in Chromium and Firefox; `pi-browser.mjs` (its
  `pi --list-models | grep -q` pipelines write to a closed pipe) in Chromium; the source suite.

Seen in the confirming round of 2026-11-05 (`work/round-1105-main.sh`, `integrate/2026-11-05` at
693b9842f, evidence `work/integrate/build/round-1105b-evidence/demos.log`):
`PI_CODING_AGENT_DIR=/tmp/rts-pi-agent rts-arena rts-test-fast rts-test-slow 25` ended with
status 141 (128 + SIGPIPE) after "RTS match: … 25s / $1 reported-cost limit", and
`demos/rts/test/rts-browser.mjs:259` failed. The same test passed in the night round before
(`round-1105-evidence`, on f0f5aff9c), in the module branch's tree, and again at 05:54 on the same
images (`rts-rerun.log`, 253 s). Not attributed yet; not retried away.

What changed in between that touches it: the kernel now knows each signal's disposition
(`tasks/20261104-074505-process-signals`): an ignored SIGPIPE is discarded, a default one ends
the process; the games' agents are assembled from packages now (`core/modules-r1`, rts-arena's
compile probes moved to rts-build). A writer to a closed pipe that does not ignore SIGPIPE ends
with 141 by design; the question is which process wrote after its reader went, and whether it
should have ignored SIGPIPE (Node's and libuv's convention, which janis and Pi rely on) or the
reader closed too early (a match's end racing its agents).

Done when: the process that took SIGPIPE is named (a loop of short matches with the kernel's
signal log), the cause is fixed where it is, and 20 matches in a row end with status 0 in
Chromium and Firefox.

## Lessons

- A runtime that claims a platform's conventions must take its process-level ones too: Node's
  SIGPIPE is ignored before any JavaScript runs, and every Node program's error handling assumes
  it. janis had the stream errors and missed the disposition under them.
- A failure seen once in a round may not come back in a loop of the same test: 160 matches did
  not reproduce it. A probe of the suspected mechanism alone (kill a child mid-write) reproduced
  it at 62 % in a minute, and its before and after are the measurement.
- Under one kernel, poll-then-write is a race whenever another process can end between the two;
  only the write's own result is the truth, so it must be handled where it is made.
