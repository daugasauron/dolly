# The core's C is compiled with the compiler's default warnings only; under -Wall one line of the kernel warns

- STATUS: CLOSED
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

## Done for the kernel (2026-10-14, 06:30)

`toolchain/CMakeLists.txt` compiles the kernel target with `-Wall -Werror`,
and the condition at `src/process-kernel.c:412` has its parentheses.

- The 20 C files and `src/file-blocks.cpp` were compiled again and linked:
  `dist/dolly.wasm` has the bytes it had (`sha256` `7eae91c9c367cf6e…`
  before and after), the runtime is `c470bb6e…` and the image inputs
  `538c5a8a…` as before. The plan builds no image.
- A warning stops the build: with an unused variable appended to
  `src/device-lease.c`, `npm run build:runtime` ends with `error: unused
  variable 'dolly_warning_probe' [-Werror,-Wunused-variable]` and status 2.
  Taken out again, the three hashes are the ones above.
- Source tests 430/0, artifact tests 25/0, `test/core-browser.mjs` in
  Chromium (24 s) and Firefox (32 s). The whole browser suite was not run
  again: the kernel's bytes are the same.
- `src/file-blocks.cpp` has no remark under `-Wall` either, so the flags
  are the target's, not C's alone.

Left, each with a round because it is in the seed or in an image:
`-Wall` for the process side (`scripts/build.sh:114`; its 13 checked files
and the 17 clients have no remark), a check of `pthread-stubs.c`,
`threads.c`, `src/slop.c`, `src/dollyfile.c` and `src/commands/`. `-Wextra`
would ask for 19 `(void)` lines in ten modules' `kernel.c`; not done.

