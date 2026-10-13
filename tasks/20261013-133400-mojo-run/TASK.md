# mojo run builds the program and starts it

- STATUS: OPEN
- PRIORITY: 240
- TAGS: toolchain,mojo,demo

Owner (2026-10-13): "I cant build and execute mojo, needs separate steps
with some error message, this is also a fork related issue or just a
shortcut?"

Done when: `mojo run NAME.mojo ARG...` and `mojo NAME.mojo` compile the
program and start it, with its arguments, its output and its exit status,
in the `mojo-gpu` image and after `amy install mojo`, tested in Chromium and
Firefox.

## As filed (2026-10-13, main `43d3ca66`)

- Today: ``error: `mojo run` compiles and executes a program in one process,
  which WebAssembly does not allow; build it with `mojo build` ``, so a
  program takes two steps, `mojo build NAME.mojo && ./NAME`.
- The answer to the owner: not `fork`, and a shortcut. Upstream's `mojo run`
  hands the program to LLVM's JIT, which writes machine code into the
  process's own memory and jumps to it; a WebAssembly process cannot run
  code it wrote, because code is a module the browser instantiates. That
  part is a real limit, and the REPL and `mojo debug` share it. But "build,
  then start what was built" needs only spawn, which Dolly has: the port
  refused where it could have built to a temporary file and started it.
- Where: `Mojo/tools/mojo/Run/mojo-run.cpp`, replaced in
  `demos/mojo/mojo-dolly.patch`. The build's cache makes a second run of an
  unchanged program 0.7 s where the first is 4.4 s (hello, Chrome 151).
- What it costs: `mojo-build` again (12 minutes) and the `mojo` package and
  `mojo-gpu` after it; no catalog round.
