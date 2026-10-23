# A boot fails with memory access out of bounds in Chromium since kernel memory grows in its own Worker

- STATUS: OPEN
- PRIORITY: 150
- TAGS: core,runtime,bug,0.1.4

No description.

Found on `core/page-no-view` (2026-10-23, Chrome 156) after merging `e0899966` (kernel memory
grows in `host/runtime/grower.mjs` while the runtime Worker waits). Booting `system` three pages
at a time in one Chromium (`work/process/build/process-evidence/probe/boot-loop.mjs`,
`COUNT=24 PARALLEL=3`): 3 of 72 boots end "FATAL memory access out of bounds" while the snapshot
is restored. With the binding growing the memory in the runtime Worker itself (one line, for the
measurement, put back): 0 of 48. One page at a time: 0 of 20 in Chromium and in Firefox.
`custom-session-browser.mjs` met it 4 times in about 10 runs, `display` and `terminal` once each.

A reading, not measured: V8 tells other threads of a shared memory's growth by an interrupt, and
the runtime thread's Wasm can touch the new pages, right after the import returns, before it
takes that interrupt. If so, the runtime Worker must see the new size itself before returning
(without growing the memory there, which is what kboundary-01 moved away).

Done when: the boot loop above boots 72 of 72 with the growth Worker.
