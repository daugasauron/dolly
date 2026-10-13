# The core's C is compiled with the compiler's default warnings only; under -Wall one line of the kernel warns

- STATUS: OPEN
- PRIORITY: 120
- TAGS: core,kernel,build

Found on 2026-10-14 while searching for code nothing reaches. Measured, not
changed.

Done when: the kernel target is compiled with `-Wall` and a warning stops
its build, the one line below has its parentheses, `dolly.wasm` has the same
bytes as before (the runtime hash `npm run build:runtime` prints), and the
core suite passes. Whether the process side and `-Wextra` follow is decided
then.

## As measured (2026-10-14, 06:25, `main` `d8a20c6d`)

- No flag asks for warnings. `toolchain/CMakeLists.txt:31` compiles the
  kernel with `-m64 -O2 -fPIC -fvisibility=default -matomics -mbulk-memory`;
  `scripts/build.sh:114` compiles the process side with `-m64 -O1 -matomics
  -mbulk-memory -fwasm-exceptions`. `-Wall`, `-Wextra` and `-Werror` occur in
  no file under `toolchain/`, `scripts/` or `config/`. It was never
  otherwise: the history's `-Wall` lines are the flags the `cc` inside Dolly
  accepts and a test that passed them. No task records a decision.
- What the compiler says when asked, with the target's own flags and
  `-fsyntax-only -Wall -Wextra`, in the pinned Emscripten container on a
  read-only mount:
  - the kernel target's 20 C files (`src/dolly.c`, `process-kernel.c`,
    `system-snapshot.c`, `device-lease.c`, `libc-host.c`, and the modules'
    `kernel.c` and `host/input/ring.c`): 20 warnings. One is from `-Wall`:
    `src/process-kernel.c:412`, `&&` within `||` without parentheses, in
    the check of a `#!` line. The other 19 are `-Wextra`'s unused
    parameters, in ten modules' `kernel.c`.
  - 13 files of `src/process/` (without the `*-check.c` probes) and the 17
    module clients: none.
  - not checked: `src/process/pthread-stubs.c` and `threads.c`, which need
    the libc's internal include paths, `src/file-blocks.cpp`, `src/slop.c`,
    `src/dollyfile.c` and `src/commands/`, which are compiled inside Dolly.
- What a change touches: kernel C and the kernel target's flags are no image
  input, so `-Wall` there and the parentheses cost one runtime build and the
  core suite. Warnings change no generated code; the same `dolly.wasm` is the
  check. The process side is in the seed: a flag there goes with a round.
  Whether `toolchain/CMakeLists.txt` itself is hashed into the image inputs
  shows in `npm run image -- --plan` after the edit.
- Not done tonight: found half an hour before the owner's check at 07:00.
