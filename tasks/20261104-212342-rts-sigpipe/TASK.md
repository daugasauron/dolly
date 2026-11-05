# rts-arena ended by SIGPIPE (status 141) once, in a match

- STATUS: OPEN
- PRIORITY: 260
- TAGS: bug,signals,pipes,rts,0.1.5

## State (2026-11-05 10:55, branch `fix/intermittent-1105`)

The writer is rts-arena, a janis program, and it should have ignored SIGPIPE: Node does from its
start, and janis did not. Fixed in janis, being verified; not yet committed.

- The match loop did not reproduce it: 160 short matches, 0 failures (`build/flaky-evidence/`
  `rts-loop.mjs`: 60 of 10 s and 60 of 25 s in Chromium, 40 of 25 s in Firefox, beside the
  candidate round's builds and the Slopyard loop). A supervisor trace (pid, parent, executable,
  every EPIPE write and every exit signal) saw no EPIPE in any of them.
- The mechanism, measured (`epipe-probe.mjs`, rts-arena image): a janis parent writing a child's
  stdin while the child is ended by SIGTERM, as rts-arena ends its Pi players, ended by SIGPIPE in
  25 of 40 runs. janis polls the pipe, then writes (`pumpChildren`); a child that ends between
  the two makes the write fail with EPIPE, and libc raises SIGPIPE, which ends a writer that does
  not ignore it. Node and libuv ignore SIGPIPE at start and report EPIPE on the stream
  (rts-arena already listens: `child.stdin.on("error", fail)`).
- 141 was rts-arena's own status (the shell's foreground command); its only pipe writes are its
  children's stdin (two Pi, two engines); the engines ignore SIGPIPE themselves.

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
