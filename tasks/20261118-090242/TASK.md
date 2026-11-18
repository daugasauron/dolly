# The lifecycle test's process room is one short at times: /proc/processes lists a process the spawn limit does not count

- STATUS: OPEN
- PRIORITY: 150
- TAGS: bug,process,tests,0.1.8

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
