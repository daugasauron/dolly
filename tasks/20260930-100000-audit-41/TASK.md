# cc/c++ driver diverges from clang behavior

- STATUS: OPEN
- PRIORITY: 220
- TAGS: bug,compiler,core

`src/compiler.cpp`: defaults are `-O2` and strict `-std=c17`/`c++23` (`:576-580`), hiding POSIX
declarations under musl; `-c src/foo.c` writes `src/foo.o` (`:155-163`, clang writes `./foo.o`);
unknown suffixes compile as C (`:117-123`); `-MD`/`-MMD` without `-MF` write no dependency file
(`:599-600`); `-Wl,-h,NAME` passes NAME as an input (`:424`); `-fPIC`, `-m64`,
`-lpthread/-lrt/-ldl`, `-Wl,--no-undefined` are dropped; DSO validation accepts any `env`
import. The `cc` proxy re-runs the compiler up to 3 times on exit 126, hiding the real failure
(`src/process/runtime-adapter.c:236-249`).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Driver defaults and outputs match clang's; unsupported flags fail or are documented.

## Done when

- Browser C tests for default dialect, `-c` output path, `-MD`, `-Wl,-h`, unknown suffix error,
  and a single visible failure on a crashing compile.
