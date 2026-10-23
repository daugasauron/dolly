# A boot fails with memory access out of bounds in Chromium since kernel memory grows in its own Worker

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: core,runtime,bug,0.1.4


Found on `core/page-no-view` (2026-10-23, Chrome 156) after merging `e0899966` (kernel memory
grows in `host/runtime/grower.mjs` while the runtime Worker waits). Booting `system` three pages
at a time in one Chromium (`work/process/build/process-evidence/probe/boot-loop.mjs`,
`COUNT=24 PARALLEL=3`): 3 of 72 boots end "FATAL memory access out of bounds" while the snapshot
is restored. With the binding growing the memory in the runtime Worker itself (one line, for the
measurement, put back): 0 of 48. One page at a time: 0 of 20 in Chromium and in Firefox.
`custom-session-browser.mjs` met it 4 times in about 10 runs, `display` and `terminal` once each,
all in Chromium.

A reading, not measured: V8 tells other threads of a shared memory's growth by an interrupt, and
the runtime thread's Wasm can touch the new pages, right after the import returns, before it
takes that interrupt. If so, the runtime Worker must see the new size itself before returning
(without growing the memory there, which is what kboundary-01 moved away).

Done when: the boot loop above boots 72 of 72 with the growth Worker.

## Closed (2026-10-24, `core/runtime-cleanup`, `c5cc2a1e`): the wait that found the growth done

Measured, then fixed. The trap's stack (the runtime Worker sending its error's stack, for the
measurement only): `BlockFile::grow` ← `setSize` ← `ftruncate` ← `dolly_snapshot_stream_write`,
the `memset` of new blocks right after `reserve` grew memory; one boot failed instead in
`kernel-plugin.mjs` ("resident plugin allocation is outside kernel memory"), the JavaScript side of
the same thing. Then, with the binding throwing when this Worker's `memory.buffer` was shorter
than the size the grower reported, three boot loops of 72 (`work/process`'s `boot-loop.mjs`,
`COUNT=72 PARALLEL=3`, `system`, Chromium) failed 3 boots each, 9 in all, every one with the stale
view right after `Atomics.wait` had returned "not-equal" (`dolly_memory_grow` ← `sbrk` ←
`malloc`). So: V8 tells a thread of a shared memory's growth by an interrupt; a waiting thread
takes it in its wait, but when the grower finished before the runtime Worker reached its wait, the
wait returns at once without taking it, and the kernel then touched pages its instance did not
know yet. Under load (three pages at once) that happens a few times a boot.

The fix: after the wait, `host/runtime/runtime.mjs` loops until this Worker's `memory.buffer` has
the new size; the loop takes the pending interrupt, which updates the buffer and the instance, and
grows nothing here. Boot loops with it: 0 of 288 in Chromium on `c5cc2a1e`, 0 of 144 after
merging `89fc25ba`, 0 of 72 in Firefox. `test/memory-growth-browser.mjs` keeps the grower's
benefit: 193 ms, then 142 ms in Chromium (235, then 198 in Firefox). Also passed in both browsers
after the merge: `core`, `npm`, `memory-growth`, `custom-session`, `host-compute`, `threads`,
`shell`, `nena`, `host-modules`, `process`, `display`, `terminal`. The loop is evidence, not a
suite test: a race of a few per cent a boot needs 72 boots to be seen.

Fixed by `c5cc2a1e` (the runtime Worker waits for its own view of the new size before the kernel
goes on), cherry-picked onto `core/page-no-view` as `41aa755d`: the boot loop above booted 72 of 72
in Chromium (2026-10-24, three pages at a time).

