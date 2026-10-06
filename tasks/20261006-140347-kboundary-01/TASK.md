# After a refused file growth, Chrome writes files about 15 times slower

- STATUS: OPEN
- PRIORITY: 180
- TAGS: bug,filesystem,performance,kernel

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

- The cause is measured, and a 1 GiB append after a refused growth takes about
  what it takes before one, in Chrome, shown by a browser test.
