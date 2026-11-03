# stack-wrap keeps a frame's room charged when an exception unwinds it

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: core,stack


Found 2026-11-03 while finding the cause of the Lean image builds' renderer crash
(`tasks/20261101-102515-retained-process-memory`).

`stack-wrap` (`host/stack/stack-wrap.c`, `instrument`) makes each charged function subtract its
slots from `dolly_stack_room` on entry and add them back on every `return` and at the body's end.
An exception that unwinds the frame (a C++ throw, a JavaScript exception thrown into Wasm) runs
neither: the slots stay charged on that stack for good. A program that throws through many
charged frames on its first stack, or on a fresh one, ends with a room below every check and
continues on a fresh stack at every charged call from then on (one continuation, 0.7 µs in
Chrome, 3.3 µs in Firefox, each), and leaves V8 a decommitted stack per pooled one when its
Worker ends. Lean's threads under the memory change made up to 257,796 one-deep continuations a
Worker that way (`work/pm-debug/build/pm-debug-evidence/repro-probe-image.log`, counters added
to `host/stack/process.mjs`); the room at each continue call was a positive constant (94) in the
main thread's deep chain, so this was not that crash's cause.

The fix is in `stack-wrap`: wrap the charged body in a `try_table` with `catch_all_ref` that
restores the room and rethrows (`throw_ref`), as the provider's own entry module does. It changes
`stack-wrap`, a tool every stack@0 image runs: a catalog round for lean, lean-std, lean-meta,
stack-wrap and the images that record stack@0.

Done-when: a C++ program that throws through 100,000 charged frames and then recurses 1,000
deep makes no continuation for the recursion (`test/stack-browser.mjs`), in Chromium and Firefox.

## Fix (2026-11-03, branch core/stack-unwind)

The room is a stack pointer kept in a global, and LLVM keeps the C stack pointer
(`__stack_pointer`) the same way: an exception leaves it wrong in every frame it unwinds, and
each landing pad sets it from its own frame again. `stack-wrap` now does that for the room:
where an exception lands in a charged function (after the block a `try_table` catch names, or
after a legacy `catch`/`catch_all`), the function charges its frame again from the local that
holds its entry room. The frames between give nothing back and need not.

Not the proposed `try_table (catch_all_ref)` around every charged body, for two measured reasons:

- It would catch and rethrow every exception, `exit`'s JavaScript one included, in every frame.
  Firefox 155 pays about 80 µs for each rethrow deep in a stack: `dive(100000)` with a
  destructor in each frame (a `catch_all_ref` and `throw_ref` per frame, as the proposal would
  add) takes 8.2 s in Firefox and 58 ms in Chrome, the same unwrapped. `./deep 200000 exit`
  would pay that per frame.
- Only frames that catch need anything. A C program that catches nothing is rewritten byte for
  byte as before (`fib.c` rewritten by both tools: `cmp` equal).

A catch whose label names a `loop` (a branch back to its start) is refused, as tail calls are:
the landing would come before the instruction that names it. LLVM puts every landing pad after
a `block`. A trap cannot be caught and ends the process anyway.

## Evidence (build/stack-evidence/ in work/stack)

`test/stack-browser.mjs`'s `throw.cpp` now also climbs 1,000 levels, each catching a throw
from 3,000 frames below. With the frames' room kept, each level had to continue on a fresh
stack, so the recursion needed 1,000 nested ones:

| | Chrome 156 | Firefox 155 |
| --- | --- | --- |
| `./throw` with the old `stack-wrap` package | status 126, `Maximum call stack size exceeded` | status 126, `too much recursion` |
| with the fix | status 0; whole test 8.0 s | status 0; whole test 25.4 s |
| fresh stacks that nest (old tool, one per level) | 400 fit, 500 do not | 250 fit, 400 do not |
| climb of 100 levels, old and new tool | 49 and 48 ms | 741 and 747 ms |

The done-when's own shape (one throw through 100,000 frames, then a recursion 1,000 deep) makes
one continuation before the fix and none after, which nothing outside the provider can see; the
nesting limit makes the same leak a failure in both browsers.

## Found on the way: Firefox and exceptions across fresh stacks

- Memory: in Firefox a caught C++ exception that was thrown on a fresh stack keeps about 0.4 to
  0.65 MB for as long as the program holds it, and LLVM holds it in a local of the catching
  frame until that frame returns. The climb holds one per level: browser peak 2.27 GB idle,
  2.92 GB at 1,000 levels, 3.76 GB at 3,000; 10,000 had the content process killed at 5.8 GB
  by the 6 GB scope. Chrome stays at 1.32 GB for 10,000. Firefox keeps nothing for 3,000 held
  exceptions that never left their stack (2.16 GB), for 3,000 that crossed a stack but were
  caught in one loop (2.28 GB), or for 6,000 continuations without one (2.27 GB). The provider
  cannot give the program another exception to hold, so this is described, not fixed;
  pre-existing, and the fix changes nothing on that path.
- Time: a C++ throw through frames with destructors costs Firefox 32 µs a frame 1,000 deep and
  about 80 µs from 3,000 deep, with or without stack-wrap (`plain-guard`: 3.2 s for 100 throws
  through 1,000 frames, Chrome 48 ms). The old test's `dive(100000)` alone takes 8.2 s there.

## Catalog

`stack-wrap` changed: rebuilt here (snapshot bb1ba75d). lean-stage0 and lean declare
`stack@0` and run `stack-wrap`; lean-std and lean-meta are built on lean-stage0. None of the four
was rebuilt: the next catalog round. The doc's new line repins `dolly-docs` and what installs it
(pi-dolly, pi-runtime, pi-phone and the pi demos built on them).

## Closed 2026-11-03

Done-when met in Chromium (Chrome 156) and Firefox 155: `test/stack-browser.mjs`'s `throw.cpp`
fails with status 126 in both with the old tool and passes with the fix (commit 852716b4f, docs
d0f106816), and passes again on work/stack's whole catalog (56 images and stack-wrap). Left for
the next catalog round: lean-stage0, lean, lean-std and lean-meta, whose programs the old tool
rewrote.

## Lessons

- Ask what a mechanism is before copying a nearby pattern. The provider catches once per stack;
  the same catch in every frame would have charged Firefox about 80 µs a frame on every throw
  and exit. The room is a stack pointer, and LLVM had already solved keeping one right after an
  exception: at the landing pad.
- A leak nobody can see (one 0.7 µs continuation) becomes a test when it is multiplied: one per
  recursion level against how many fresh stacks nest (Chrome under 500, Firefox under 400),
  measured first, then sized at twice that.
- Time a new test in the slow browser before committing it: the first draft, with a destructor in
  each of 3,000 frames per level, passed Firefox in 270 s, 30 s from its deadline; without the
  destructors it takes 25 s.
- Measure a browser's memory with its own scope's `memory.peak`; `ps` over every Firefox process
  summed other agents' browsers into 13 GB.
- A tree made from another tree's images lacks its keyed `build/` staging: the full catalog build
  failed on `build/rustc-port/prepare.inputs` and two rustc archives (87 MB, copied from
  work/phone), not on any image.
