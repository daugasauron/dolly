# Chrome makes every system call 15 times slower once kernel memory passes twice V8's heap limit

- STATUS: OPEN
- PRIORITY: 130
- TAGS: bug,filesystem,performance,kernel,0.1.4

## The trigger, measured (2026-10-23, Chrome 156.0.8078.47, `core/runtime-cleanup`)

Still reproduced on today's tree: the 2026-10-13 probe (`system`, `--js-flags=--max-old-space-size=1024`)
writes 256 MiB in 170 ms before kernel memory grows and in 3,417 ms once it is 1,700 MiB
(`build/runtime-evidence/growth/chrome156-1g.log`).

A page of its own reproduces it now (`build/runtime-evidence/v8-external/`, not committed): a Worker
holds a shared memory64, grows it to 2.5 GiB, and times 2,000 message round trips with a second
Worker. Three conditions, each needed:

| Worker that measures | Grown by | Kernel-like memory | 2,000 round trips before, after |
| --- | --- | --- | --- |
| 32 MiB of live JavaScript objects | itself (`memory.grow` in Wasm) | 2.5 GiB | 27 ms, 344 to 546 ms (117 to 310 Mark-Compacts) |
| 32 MiB | itself | 1.2 GiB | 25 ms, 24 ms |
| 4 MiB | itself | 2.5 GiB | 22 ms, 17 to 20 ms |
| 12 MiB | itself | 2.5 GiB | 21 ms, 329 to 822 ms |
| 32 MiB | another Worker | 2.5 GiB | 28 ms, 21 to 40 ms |
| 32 MiB | another Worker, then one page by itself | 2.5 GiB | 30 ms, 421 to 494 ms |

So V8 counts a shared memory as external memory of the isolate that grows it, and of no other
isolate that holds it (the trace's "External memory reported" is 2.5 GiB in the grower, 1 MiB in the
other); once that passes twice the old-space limit, an isolate whose old generation is above V8's
activation threshold (between 4 and 12 MiB) starts incremental marking on every allocation and
finalizes it as a task between messages. Synchronous allocation alone stays fast; what slows down is
the event loop, which is where Dolly's supervisor answers every system call. A single growth by the
isolate itself, of one page, accounts the whole memory there again: growing ahead of the kernel from
another Worker cannot work, every growth has to happen elsewhere.

The fix this points to: the kernel never grows its memory itself. `emscripten_resize_heap`, the one
place its allocator grows memory (`sbrk`), would call a `runtime@0` import that hands the growth to a
Worker of its own and waits for it (`Atomics.wait`). The probe does exactly that
(`grower=import`): the Wasm call that asked for the growth stores at the new last byte right after the
import returns, and 2,000 round trips take 21 ms before and 21 to 24 ms after, at 2.5 GiB and a 32 MiB
old generation. It is one import more in `abi/dolly-browser-0.wat`, no new authority (the kernel's
own memory, up to its declared maximum).

## State (2026-10-13)

The cause is measured and the case this task was filed for is fixed (`core/polish`, kernel only):
a growth of many blocks that cannot fit is refused before it takes any memory
(`src/file-blocks.cpp`, `BlockFile::reserve`), so kernel memory does not end at its maximum.
`test/fs-growth-browser.mjs` times a 1 GiB append before and after a refused 9,000 MiB
`ftruncate`: 921 ms and 10,538 ms on main's kernel in Chrome, where the test fails, and the same
time on both sides with the fix. The suite passes in Chromium and Firefox.

Left: the slowdown itself is Chrome's and still there when kernel memory really grows that far.
"Cause" below has the measurements; on this desktop it needs 8 GiB, on a device whose V8 heap
limit is 1 GiB about 2 GiB. Lowered from 180: the refused growth no longer triggers it.

## Cause (2026-10-13, Chrome 151.0.7922.71, `system`)

Not the allocator and not a first touch: after the refused growth, sizing and zeroing 512 MiB in
one call takes what it took before (20 ms). What is slower is every system call, by 0.1 to
0.3 ms: 512 `fstat` calls take 59 to 141 ms in place of 3 to 4 ms, and a write, which libc sends
in 16 KiB packets (64 calls a MiB), 5,700 ms for 512 MiB in place of 300 ms. The supervisor's own
work in a call (the gate's two copies and the kernel's dispatch) measures the same before and
after, about 2 microseconds.

The time is V8's garbage collector in the runtime Worker. Chrome with
`--js-flags=--trace-gc,--trace-gc-verbose` reports for that isolate "External memory reported:
8,454,666 KB" once kernel memory is 8 GiB, against a heap limit of 4.1 GiB: V8 counts the shared
Wasm memory the Worker has grown as that isolate's external memory. From then on it runs an
incremental Mark-Compact about every millisecond ("finalize incremental marking via task", 9,000
to 14,000 of them in one run of the probe, 25 before the growth), each 0.25 to 0.5 ms on a 1.6 MB
heap that has nothing to free. Memory never shrinks, so it lasts until the page is reloaded.

Where it begins depends on V8's heap limit for the Worker, which Chrome takes from the device's
memory. With `--js-flags=--max-old-space-size=1024` the same probe is fast at 1.4 GiB of kernel
memory, slows down during the run that takes it past 1.9 GiB and is 15 to 20 times slower from
2.2 GiB on: about twice the old-space limit. Without the flag on this desktop (60 GB, limit
4 GiB) that is 8 GiB, Dolly's maximum. Firefox does not do it.

Not found: a way to keep V8 from counting the memory. A page of its own
(`build/polish-evidence/v8-grow/`, not committed) in which a Worker grows a shared memory to
8 GiB, by itself or through a second Worker, with and without an instance that imports it,
reports the same external memory and does not start the collections: what starts them in Dolly
and not there is not known. A second Worker that does the growing, so that the count lands in an
isolate that allocates nothing, is the idea that page was written to test; it stays untested.

Probes (not committed): `build/polish-evidence/growth-probe.c` times the parts of a write,
`grow-to.c` grows kernel memory to a size, `probe.mjs` runs commands in an image.

## The defect

Found while verifying `20261005-133401-kernel-boundary`; not caused by it.

## Reproduction (Chrome, `system` image, 2026-10-06)

`test/fixtures/fs-growth.c` compiled in the image as `g`:

    ./g append a 1024    # 0.8 to 0.9 s
    rm a
    ./g append b 1024    # 0.5 to 0.7 s
    rm b
    ./g size huge 9000   # refused with ENOSPC (status 51) in about 50 ms
    rm -f huge
    ./g append c 1024    # 9 to 13 s
    rm c
    ./g append d 1024    # 9 to 13 s, and so on for the rest of the session

`ftruncate` to 9,000 MiB makes `BlockFile::reserve` (`src/file-blocks.cpp`)
allocate 1 MiB blocks until `malloc` fails at the kernel's 8 GiB maximum, then
free them all. Kernel memory stays at its maximum size afterwards.

## Evidence

- Measured twice with each runtime: the standalone kernel (`89e78ca0`) and the
  one loaded by Emscripten's JavaScript (`7e39f6ee`). Same numbers, so neither
  memory growth in Wasm nor the glue is the cause.
- Firefox is not affected: the 1 GiB append after the refusal takes 1.3 s.
- Not investigated further. Candidates: what the allocator does for each block
  once the heap has been at its maximum (every block allocation first takes
  and frees a 128 MiB reserve), or the cost of a first touch in Chrome once
  the memory is 8 GiB long.
- Logs: `build/kboundary-evidence/step4/growth-timing-*.log` in
  `work/kboundary`; the probe is `build/kboundary-evidence/probe-growth-timing.mjs`
  (not committed): the commands above through `submit`, timed.

## Done when

- Met on 2026-10-13: the cause is measured, and a 1 GiB append after a refused growth takes
  about what it takes before one, in Chrome, shown by a browser test.
- Left: a session whose kernel memory has passed twice V8's heap limit makes system calls at the
  speed of one below it, in Chrome, with V8's old space limited to 1 GiB in the test; or the
  measurements that say it cannot be had from a page.
