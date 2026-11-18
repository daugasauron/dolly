# The lifecycle test's process room is one short at times: /proc/processes lists a process the spawn limit does not count

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: bug,process,tests,0.1.8

## Closed (2026-11-19)

The test's room, not the limit, was wrong. The limit (56) counts every process listed: the four
that stay listed are `/bin/foreground`, `slop`, `timeout` and `lifecycle`, so 52 children fit.
The room is computed from a listing of five: the fifth is `lifecycle adopted` (parent 0), the
child the adopting mode abandons. It prints its line at exit, so the parent reads the line
while the child is still ending, and on a loaded machine the listing that sets the room comes
before the child's exit. The wait before it covered the orphans' children (`foreground-exit`)
alone.

Evidence (`fix/rc-core`, the 0.1.8 round's images, Chrome): a scratch run of the fixture in a
workbench, with the listing at the room dumped on failure, failed 1 run in 20 under the round's
load; with the adopted child sleeping 300 ms after its line, 3 in 3, each listing at the room
holding `PID 0 running .../lifecycle adopted` beside the four, `count 52 room 51` in both loops
(the counts below). With the fix, the same slowed child passed 3 in 3. Fix
(`test/fixtures/process-lifecycle.c`): the wait before the room covers the adopted child too
(`abandoned()`). `test/process-browser.mjs` passes in Chrome and Firefox.

## State 2026-11-18

Seen, not explained. Found while testing `tasks/20261117-195610-lean-crash`.

## Reproduce

`node test/process-browser.mjs chromium` (Firefox once too) on a machine busy with builds fails
at times at `test/fixtures/process-lifecycle.c`'s `CHECK(spawned == -EAGAIN && count == room)`,
after the trees of `test/process-browser.mjs` have left `/proc/processes`: three runs in eight
on the 0.1.8 integration (`0ae1331a2`) with `eaf5ca0a5`, which changes only the message of a
process that fails, and one in two with that commit's function defined but never called.
`0ae1331a2` alone passed five runs in a row.

## Findings

A line printing the counts (not kept), in two failing runs: `count 52 room 51 listed 4` for
the exiting children, then `count 52 room 51 listed 56` for the running ones. Both loops are
one over, and with 52 children running `/proc/processes` lists 56: the process the spawn limit
does not count stays listed through both loops, so it is not a process that ended in between.
`sh`, `timeout` and `lifecycle` are three; which the fourth is, a run that dumps the listing
when the check fails would say (three such runs passed).

## Done when

The fourth process is named and the test's room or the limit's count is right, by the cause.
