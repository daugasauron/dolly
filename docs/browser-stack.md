# The browser stack

A Dolly process recurses on a stack that belongs to the browser, that a page
cannot size, and that is far smaller than a native one. This page says what
that bounds, how a process is entered to get the larger of the stacks a
browser offers, why Firefox is entered differently, what it means for
building LLVM inside Dolly, and how a program goes deeper than one stack.
Every number was measured in headless Chrome 151 and Firefox 155 in October
2026; the runs are recorded in the tasks `tasks/20260930-232236-llvm-in-dolly`
and `tasks/20261027-232422-lean`.

## Two stacks

- The stack in the process's own memory holds what C keeps in memory: arrays,
  structures, anything whose address is taken. It is 8 MiB, it is what
  `RLIMIT_STACK` reports, and it is not the limit described here.
- Each WebAssembly call also takes a frame on the browser's stack of the
  Worker the process runs in: return addresses and locals that never enter
  memory. A program can neither read its depth nor ask for more. When it
  ends, the process traps (Chrome: `Maximum call stack size exceeded`,
  Firefox: `too much recursion`) and exits with status 126, like any other
  trap ([process model](process-model.md)).

Native programs get 8 MB for both. Here the second one is the bound, and
deeply recursive programs meet it first: compilers above all.

| Entered | Chrome 151 | Firefox 155 |
| --- | --- | --- |
| directly, in a Worker | 500 KB (Blink's fixed Worker limit); the probe nests 2,766 calls | the probe nests about 5,900 calls |
| through `WebAssembly.promising` | about 950 KB; the probe nests 5,252 calls | the same as directly (5,957) |

Chrome's flags `--stack-size` and `--wasm-stack-switching-stack-size` change
neither Chrome number by more than 5%: a page gets these stacks and no
larger one. The size of a frame depends on which of the browser's compilers
produced the code, so a depth is a range, not a constant.

## How a process is entered

`WebAssembly.promising` is the JavaScript Promise Integration (JSPI) call
that runs an export on a stack of its own. Dolly uses it for that stack
alone: no import is `Suspending`, so a process still runs to completion
before its Worker handles anything else.

- When the supervisor starts, it measures how many calls a small recursive
  module nests before the stack ends, entered each way
  ([`process-supervisor.mjs`](../src/process-supervisor.mjs)).
- An executable asks for the deeper stack with a `dolly.process.stack` custom
  section, and only the compiler carries one
  ([`compiler-main.c`](../src/process/compiler-main.c)). It and its threads
  enter through `promising` where that is at least half again as deep
  ([`process-worker.mjs`](../src/process-worker.mjs)); every other program is
  entered directly, in every browser.
- Chrome measures 1.90 times and enters the compiler through `promising`.
  Firefox measures 1.01 and enters it directly. Both gave the same reading in
  48 measurements of 48, in under 3 ms. No browser is named in the code.
- The probe keeps sixteen values across each call, so its frame is the same
  size whichever compiler tier runs it. A one-local recursion was useless in
  Firefox: its ratio moved between 0.4 and 2.4 as tiers changed.
- The entry is not an input of any image: changing it rebuilds nothing.

## Why Firefox is entered directly

Firefox 155 reports `uncaught exception: undefined` for every Worker that is
terminated while it is inside a `promising` call, whatever the WebAssembly
is doing.

- Ending a process terminates the Workers of its remaining threads, so every
  threaded program produced one report per thread: 4 to 6 per run of a
  four-thread test program, however the threads were parked and however the
  process ended. Threads that leave with `pthread_exit` and are joined
  report nothing.
- It needs no Dolly: an 80-byte module in a nested Worker, entered through
  `promising` and then terminated, reports every time in Firefox and never
  in Chrome; entered directly it never reports.
- Nothing can take the report. An `error` listener on the Worker and the
  parent's global `onerror` receive nothing; it goes to the console and at
  times to the page's error event. Programs ran correctly throughout: what
  broke was a page that must stay free of errors.
- Firefox's direct stack is already as deep as Chrome's larger one, so
  entering directly costs Firefox nothing.

[`test/threads-browser.mjs`](../test/threads-browser.mjs) requires that the
browser reports nothing while threaded processes are interrupted and ended.
A browser whose `promising` stack is deeper and which has the same fault
would fail it.

## What cannot be compiled

Clang recurses once per element of what it compiles. `cc` and `c++` fail
with status 126 on:

- one expression of about 770 chained member calls in Chrome (760 fit before
  the browser has optimized the compiler, 800 after); 700 fit and 760 fail
  in Firefox. Without the `promising` entry Chrome stopped near 400.
- 3,300 to 4,000 consecutive `case` labels compiled with
  `-Wimplicit-fallthrough` in Chrome; Firefox fails on 6,020 too. The
  warning's analysis is the recursion: without that flag the same code
  compiles.

Ordinary source is far from both; generated source can reach them. The
margins move with the browser's compiler tiers: forcing Chrome to optimize
every function (`--no-liftoff`) lowers the first limit to about 590.
[`test/cpp-browser.mjs`](../test/cpp-browser.mjs) compiles a 640-call chain
in both browsers.

## LLVM built inside Dolly

Two files of LLVM's own source reach these limits, which is how they were
found (the demo is `demos/llvm`):

- `MSP430.cpp` chains 635 calls. It compiles through the `promising` entry
  in Chrome (12 times of 12) and directly in Firefox.
- `SemaARM.cpp` includes 6,020 consecutive `case` labels and needs 1.44 MB
  for the fallthrough warning, more than either Chrome stack. The LLVM
  recipe therefore configures with `LLVM_ENABLE_WARNINGS=OFF`; diagnostics
  do not change the objects.

| | Chrome | Firefox |
| --- | --- | --- |
| Build the compiler's 2,559 units (`llvm-build`, 44 minutes at four jobs) | yes: this is how the image is built | the two deepest units compile; the whole build has not been run |
| Rebuild it with itself (`stage2-browser.mjs`, on demand) | yes, identical to the first | not run |
| Use the built compiler: the `llvm-cc` image, `amy install llvm` | yes | yes |

Images are built by a Chromium-based browser and are the same bytes for
every browser that opens them. So the self-compilation running only in
Chrome limits who can rebuild the image, not who can use it.

## Deeper than one stack: stack@0

A program that `stack-wrap` rewrote continues on a fresh stack when the one
it runs on is nearly used ([`host/stack`](../host/stack/dolly-stack-0.wat)).
WebAssembly cannot read a browser stack's depth, so the program keeps count:

- Each function that makes calls charges an estimate of its frame against a
  global, the room, on entry and gives it back on return: 16 slots of 8 bytes
  plus one for each parameter and local. A function that makes none is left
  as it was; every check keeps room for the largest of those.
- With too little room, the function stashes its arguments and itself in
  globals and asks the `stack@0` provider, in its own Worker, to continue.
  The provider runs the program's `dolly_stack_continue` through
  `WebAssembly.promising`, which makes the call again on a fresh stack.
- JavaScript runs on the thread's first stack wherever it is called from:
  a program entered from JavaScript on the fresh stack ran on the first one
  again. The provider therefore enters it from a module of three functions,
  which also catches what it throws; the stack below throws it again, so C++
  exceptions and `exit` cross stacks. A trap on a fresh stack ends the
  function below it with a trap too, and the process fails with the first
  one's reason.
- A stack's room is half of what the supervisor's probe nests on it. With
  each stack's full measure instead, the deepest test still passed; at 1.3
  times it, a function of 32 locals overflowed in both browsers.

Measured with hand-written modules (Chrome 151, Firefox 155, October 2026):

| | Chrome | Firefox |
| --- | --- | --- |
| A recursion of 1,000,000 calls | 20 ms, about 200 stacks | 0.5 s, 175 stacks entered through `promising`; entered directly, the first stack ran out after about 170 |
| A move to a fresh stack and back | 0.7 µs | 3.3 µs |
| `fib(32)`, every call charged | 2.6 times as long | 2 times as long |

Not solved: a Worker that Firefox terminates while it is inside a
`promising` call reports the fault above. A program that ends while another
of its threads is deep in a fresh stack, or that is killed there, shows it.
A tail call through a check would grow the stack, so `stack-wrap` refuses
one, and debug information, whose code offsets would be wrong.
