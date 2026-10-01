# cc/c++ driver diverges from clang behavior

- STATUS: CLOSED
- PRIORITY: 140
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

## Recheck (2026-10-01, `rebuild-batch`)

Fixed since the audit: unknown suffixes go to the linker as in Clang; `-MD`/`-MMD`
without `-MF` write `NAME.d` beside the output; `-Wl,-h,NAME` becomes
`--soname`; `-m64`, `-fPIC`, `--no-undefined` and `-l` runtime names are
handled explicitly; plugin links reject imports outside the contract
(`f3c6496`). The 126 retry was restored deliberately for Worker launch
failures only (`5221de8`); compile errors are never retried.

Left, an owner decision: the defaults `-O2` and strict `-std=c17`/`-std=c++23`
(documented in `docs/process-model.md`) differ from Clang's `-O0` and
`gnu17`/`gnu++17`. Strict modes define `__STRICT_ANSI__`, so musl hides POSIX
declarations from sources that do not request them. Matching Clang means
rebuilding the catalog and fixing recipes that rely on the current defaults.

Owner (2026-10-01): investigate the consequences of each choice before deciding.

## Investigation (2026-10-01)

Setup: worktree `work/cc-defaults` (branch `work/cc-defaults` from `work/next-build`
`231bc59`, images `f8373aec…`), `default` image in headless Chromium, alternative
defaults emulated with explicit flags against the current `cc`. Header analysis
on `.cache/emscripten/sysroot/include`, the headers the kernel seed preloads
(`scripts/prepare-kernel-seed.sh:12`). Clang facts from `.cache/llvm-project`
(`llvmorg-24-init-5068`). Timings are same-session, host load ~8 from another
session's browser tests; treat them as ratios.

### 1. Dialect

Clang 24 defaults to `gnu17` and `gnu++17`
(`clang/lib/Basic/LangStandards.cpp:106-117`). Measured predefines in Dolly:

| mode | `__STRICT_ANSI__` | `_GNU_SOURCE` |
|---|---|---|
| `cc` (default `-std=c17`) | 1 | – |
| `cc -std=gnu17` | – | – |
| `c++` (default `-std=c++23`), `-std=c++17` | 1 | 1 |
| `c++ -std=gnu++23`, `-std=gnu++17` | – | 1 |

`_GNU_SOURCE` is predefined for C++ by the WebAssembly OS target
(`clang/lib/Basic/Targets/OSTargets.h:950-952`), so C++ sees all of POSIX in
every mode. In C, musl's `features.h:12-17` grants `_BSD_SOURCE` +
`_XOPEN_SOURCE 700` only when no feature macro and no `__STRICT_ANSI__` is
set; `features.h` is the only sysroot header keyed on `__STRICT_ANSI__` (libc++
never is). Declarations hidden by the C default (gated/total per header):
`stdio.h` 56/125 (`fileno`, `fdopen`, `popen`, `getline`, `ssize_t`…),
`stdlib.h` 57/107 (`realpath`, `setenv`, `mkstemp`…), `string.h` 23/50
(`strdup`, `strndup`, `memmem`, `strtok_r`…), `math.h` 47/250 (every `M_*`),
`time.h` 40/60 (`clock_gettime`, `CLOCK_*`, `nanosleep`, `*_r`), `signal.h`
116/121 (`sigaction`, `kill`, `sigprocmask`…), `fcntl.h` 76/136 (`R_OK`…),
`limits.h` 41/113 (`PATH_MAX`, `SSIZE_MAX`…), `unistd.h` 49/411 (`usleep`…).

20 one-file C snippets compiled with bare `cc` vs `cc -std=gnu17`: 14 fail at
the default (`fileno`, `fdopen`, `popen`, `getline`, `strdup`, `strndup`,
`memmem`, `realpath`, `usleep`, `clock_gettime`, `M_PI`, `sigaction`,
`typeof`, `asm`), 0 fail with `gnu17`; `strcasecmp`, `getopt`, `d_type`,
`stat`, `gettimeofday` and statement expressions pass in both. The exact
`check_symbol_exists` probe CMake generates fails for `fileno`, `strdup` and
`clock_gettime` at the default, so configure-time probes under-report
capabilities. `-D_POSIX_C_SOURCE=200809L` rescues the functions but not `M_PI`
(`_XOPEN_SOURCE`/`_DEFAULT_SOURCE`/`_GNU_SOURCE` do).

Catalog: every multi-file upstream build pins its own `-std` (gnu99/gnu11:
make, git, awk, zig, QuickJS, Lua, raylib; c99/c11/c17: ninja, ghostty,
CPython, zlib, libffi, …). Lines that compile C with no `-std` and therefore
depend on the default: `core-tools.dm` (15 tools, `cc -O2`), `download.dm:34`,
`curl.dm:31`, `session-recovery.dm:12`, `codex.dm:12`, `codex-build.dm:27`,
`rust-sdk.dm:17`, `classicube-agent.dm:23`, `demos/classicube/Makefile:10`,
`sbase.dm:31` (`CFLAGS=-O2`), the lua/treesitter/utf8proc/libuv check
programs, the Rust `cc`-crate C deps in `demos/codex/config/patti.toml`, and
any CMake project without `CMAKE_C_STANDARD`. Workarounds for the strict
default already in the tree: in-source `#define _POSIX_C_SOURCE 200809L` in
18 of 26 `dist/static/default/commands/*.c`, 7 of 15 core-tools sources,
`gpu-fluid.dm:208`, `bhop.dm:317`, `gamedev-sdk.dm:109`; flag-level
`-D_POSIX_C_SOURCE=200809L` in `patti.toml:3,10` and `ninja.dm:27`,
`-D_BSD_SOURCE -D_POSIX_C_SOURCE` in `demos/classicube/Makefile:10`,
`-D_DEFAULT_SOURCE` in `curl.dm`, `tar.dm`, `awk.dm`, `git.dm`. No patch adds
feature macros. Nothing in the catalog needs strict C; recipes that want it
pass `-std=c17` explicitly.

### 2. C++ standard

Nothing in the catalog compiles C++ with the default dialect; every C++ line
pins c++11/17/20 (`rts-arena.dm:29`, `openal.dm:33`, `cmake.dm:44`,
`local-llm-engine.dm:16`, CPython header check). `src/compiler.cpp` uses
C++20/23 but is built by the external toolchain. Only
`test/cpp-browser.mjs` and `test/fixtures/cpp-sdk.mjs` rely on the default,
and their sources are C++17-level (the iostream/map/sort sample compiles in all
four modes). Measured per mode (default c++23 / gnu++23 / gnu++17 / c++17):
POSIX (`strdup`, `usleep`, `fileno`) and `M_PI` pass in all four;
ranges/concepts/span and `std::expected`/`std::println` pass only in the 23
modes; `typeof` passes only in the gnu modes. So `gnu++23` vs `c++23` differs
only in GNU keywords, and `gnu++17` would reject C++20/23 code written for
today's default; the sysroot libc++ (LLVM 24) implements C++23 either way.

### 3. Optimization

Lines relying on the implicit `-O2` (no `-O`): `awk.dm:20,24`, `tar.dm:275`
(the bootstrap `tar` every recipe runs), `gzip.dm:11`, `curl.dm:23`,
`download.dm:34`, and the five QuickJS launchers `bhop.dm:726`,
`classicube-agent.dm:24`, `rts-arena.dm:31`, `typescript.dm:35`,
`pi-build.dm:87` (`libdolly-js` itself is `-O2`, `quickjs.dm:31`). Everything
else pins a level, downward for big builds with stated reasons: git `-O0`
("deterministic browser cold-build latency", `git.dm:33-35`), CPython outliers
`-O0` ("optimizer spends minutes", `cpython.dm:46-49`), NumPy
`-Ddisable-optimization` (`bonnie.dm:17-18`), cmake/neovim/luv/parsers
`-O0`, make/ninja/libffi/sdl2/llama/openal/codex `-O1`.

Build systems: autoconf sets `CFLAGS="-g -O2"` when unset (CPython
`configure:5793`); CMake adds `-g` (Debug), `-O3 -DNDEBUG` (Release),
`-O2 -g` (RelWithDebInfo), nothing without a build type
(`Modules/Compiler/GNU.cmake:59-65`) and `-std=gnuNN` when a standard is set
(`Clang-C.cmake:25-32`); Meson's default `debug` is `-O0 -g`; the Rust `cc`
crate passes `-O<opt-level>` unless `CRATE_CC_NO_DEFAULTS` (codex sets it and
pins `-O1`). The driver default therefore matters for bare `cc file.c`, empty
`CFLAGS` Makefiles, CMake without a build type, and CMake Debug: `cc -g` still
gets `-O2` (`__OPTIMIZE__` defined; the C++ benchmark built with `-g` runs at
`-O2` speed), where Clang gives `-O0`. All six CMake recipes in the catalog
set a build type and override the per-config flags.

Measured in the `default` image (ms, min of 2-3 samples; sizes in bytes):

| compile | -O0 | -O1 | -O2 |
|---|---|---|---|
| hello.c, compile+link | 135 | 130 | 122 |
| hello.cpp (`<iostream>`) | 952 | 1002 | 912 |
| mb.c (micro benchmark) | 130 | 182 | 165 |
| cxxbench.cpp (`<regex>`, `<map>`, `<sstream>`) | 1372 | 1710 | 1794 |
| zlib, 15 TUs, `make -j1` | 1755 | 2440 | 2496 |
| awk `run.c` `-c` | 187 | 454 | 504 |
| awk, 9 TUs + link | 469 | 1054 | 1169 |

| run | -O0 | -O1 | -O2 |
|---|---|---|---|
| sieve 8e6 / matmul 220 / fnv 32 MiB / strstr 8 MiB | 21 / 10 / 25 / 9 | 13 / 3 / 25 / 9 | 12 / 3 / 25 / 9 |
| zlib `compress2` 2×6 MiB / `uncompress` | 512 / 62 | 356 / 44 | 351 / 44 |
| C++ sort 1e6 / map+ostringstream 2e5 / regex_match 1e5 | 24 / 131 / 301 | 23 / 25 / 45 | 22 / 23 / 46 |
| awk, 300k-line script (wall) | 270 | 191 | 192 |
| size: hello / awk / cxxbench / libz.a | 33106 / 274883 / 900402 / 156724 | 22992 / 268898 / 436138 / 112414 | 22992 / 267780 / 437534 / 106816 |

`-O2` costs nothing on the edit-compile-run loop (process spawn and header
parsing dominate), 1.4x on zlib and 2.5-2.7x on awk per TU, and buys 1.4x
(awk, zlib) to 6x (template-heavy C++) run time and 30-50% smaller binaries.
`-O1` is not a cheaper middle: same speed as `-O2` at nearly the same compile
cost.

### 4. Agent ergonomics

Agents write `cc file.c` expecting GCC/Clang behavior. Today 14 of 20 common
POSIX/GNU snippets fail with "call to undeclared function" or "use of
undeclared identifier"; the fix they must discover is `-std=gnu17`,
`-D_GNU_SOURCE` or a per-file `#define`, and the obvious portable one
(`_POSIX_C_SOURCE`) still leaves `M_PI` undefined. C++ needs nothing extra.

### Recommendation

Match Clang on the dialect: `gnu17` and `gnu++17`. Keep the `-O2` default.

- `gnu17`: the strict default protects nothing (no recipe needs strict C) and
  costs exactly what AGENTS.md forbids: per-program compatibility shims (18/26
  command sources, 7/15 core tools, `patti.toml`, ninja, classicube) and
  under-reported capabilities to upstream probes. Every upstream build already
  compiles under gnu modes on Linux, so the switch is the low-risk direction.
- `gnu++17`: `_GNU_SOURCE` is predefined for C++ here, so the only observable
  gain from gnu over strict is GNU keywords; choosing 17 over 23 is parity with
  what agents and upstream expect from an unflagged `c++`. The sole measured
  cost is C++20/23 code written without `-std`, which breaks the same way on
  every Clang/GCC the agent knows; the cpp tests compile unchanged. If the
  owner prefers a modern default, `gnu++23` is the alternative with zero
  catalog cost.
- `-O2`: parity would cost 12 recipe edits plus a `-g`-only divergence fix,
  and the measured penalty of `-O2` where the default actually applies
  (ad-hoc programs, small tools) is nil, while the gain is 1.4-6x. Large
  builds already pin `-O0`/`-O1` for cold-build latency and would keep doing
  so. Document the one deliberate divergence in `docs/process-model.md`, and
  decide separately whether `-g` without `-O` should stay optimized (today it
  silently does).
- Cost of the dialect change: the compiler is in the seed, so every image
  rebuilds (~3.5 h). Leave the existing feature-macro shims in place; they are
  harmless and portable. "Done when" test: bare `cc` compiles a `fileno`/
  `M_PI`/`clock_gettime` snippet and `cc -x c -E -dM - </dev/null` lacks
  `__STRICT_ANSI__`; `__OPTIMIZE__` in the same output records the `-O` default.

## More evidence (2026-10-01, LLVM stage 1)

Configuring LLVM inside Dolly, five `config.h` checks (`getpagesize`, `sbrk`,
`setenv`, `sigaltstack`, `strerror_r`) came out missing only because `cc`
defaults to strict `-std=c17`; with `-DCMAKE_C_FLAGS=-std=gnu17` they match
the seed's configure. Upstream CMake probes under-report under the current
default.

## Decision (2026-10-01, delegated)

Match Clang's dialect defaults: `gnu17` for C and `gnu++17` for C++; keep the
`-O2` default as the one documented divergence. Reasons: 14 of 20 ordinary
agent snippets fail under strict `c17`, upstream CMake probes under-report
(LLVM's `config.h`), no catalog C++ relies on the `c++23` default, and Clang's
own defaults are what build systems assume.

## Closed (2026-10-01)

The decision is applied: `src/compiler.cpp` defaults to `-std=gnu17` and
`-std=gnu++17` with `-O2` as the one documented divergence
(`docs/process-model.md`). Done-when coverage: bare `cc` sees POSIX and BSD
declarations (`test/cpp-browser.mjs`), `-MD`/`-MMD` and `-Wl,-h` behave like
Clang (`test/fixtures/process-smoke.mjs`), unknown suffixes reach the linker,
and a crashing compile fails once (the 126 retry covers only Worker launch
failures, `5221de8`). `work/core-polish` also dropped the in-house recipes'
`-std=c17` pins that existed only for the old default.
