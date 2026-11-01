# cc -v without input prints Clang's banner, as configure scripts read it

- STATUS: OPEN
- PRIORITY: 120
- TAGS: compiler,toolchain

Found by the FFmpeg port (`tasks/20261101-075355-ffmpeg`, 2026-11-01). FFmpeg's `configure`
(`probe_cc`) names its compiler by `$cc -v 2>&1 | grep -q clang` (GCC by `^gcc`), as autoconf's
version log and Meson read `-v` too. Dolly's `cc -v` with no input prints `cc: no input files`
and ends with 64 (`src/compiler.cpp`, the `options.inputs.empty()` refusal after
`parse_driver_options`), so configure warns "Unknown C compiler cc, unable to select optimal
CFLAGS" and gives no optimization, dependency or Clang flags: FFmpeg would build at `-O0`.
`demos/ffmpeg/Dollyfile-ffmpeg` therefore passes `--optflags=-O3`.

## Done-when

- `cc -v` and `c++ -v` alone print on stderr what Clang 24 prints (`clang version 24.0.0`,
  `Target: wasm64-unknown-dolly`, `Thread model: posix`) and end with 0; with inputs, `-v`
  stays a frontend option.
- After the compiler round (`llvm-cc` built and pinned, `docs/sources.md`), FFmpeg's
  configure prints no "Unknown C compiler" and its recipe drops `--optflags=-O3`.
