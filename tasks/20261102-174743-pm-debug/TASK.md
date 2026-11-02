# stack-wrap keeps a frame's room charged when an exception unwinds it

- STATUS: OPEN
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
