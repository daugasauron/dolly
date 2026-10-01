# Move Slop and other bootstrap programs out of the seed into recipes

- STATUS: CLOSED
- PRIORITY: 290
- TAGS: core,bootstrap,dollyfile,design

Owner request (2026-10-01): investigate why the bootstrap boundary is where
it is. Slop could be compiled by a Dollyfile instead of being a "kernel thing"
included by default; the core should be as small as possible, with everything
else modular.

## Today (read 2026-10-01)

- The seed (`dist/dolly.data`, `scripts/build.sh`, `scripts/prepare-kernel-seed.sh`)
  holds the stamped compiler executable, process libc and headers, and the
  sources of the `cc`/`c++`/`ld`/`ar` wrappers, Slop and the Dollyfile engine.
- `src/process/bootstrap.c` runs inside Dolly before any recipe: it compiles
  those wrappers, Slop and the engine with the seed compiler (`-O1`) into
  `/bin`, then runs the root recipe.
- Slop must exist first because the only command step is `SLOP`, which runs
  `/bin/slop -e -c` (`docs/dollyfile.md`).

## Questions

- What is the smallest seed: kernel, compiler executable, libc/sysroot and
  the Dollyfile engine (plus bootstrap)? Can the engine itself be built by an
  earlier, smaller engine, or must it stay a bootstrap exception?
- A shell-free exec step (for example `RUN program argument…`, argv only)
  would let `modules/slop.dm` build Slop like any program; the same for the
  compiler wrappers and core commands. What does it cost in the language and
  the engine, and what else depends on `/bin/slop` existing at boot (the
  bootstrap's own messages, `ENTRY`, session recovery, tests)?
- Identity: moving Slop into a recipe makes it part of `system-build`'s
  recipe graph instead of the seed hash.

## Done when

- A decision memo with measurements, then: Slop (and whatever else need not
  be in the seed) is built by recipes; the seed lists only what must bootstrap.

## Owner proposal (2026-10-01)

A `COMPILEC` step that runs the seed compiler directly, as `bootstrap.c`'s
`compile_source()` does today, so `modules/slop.dm` can compile Slop before
any `SLOP` step. Leading design, prototyped against a general argv-only `RUN`.

## Boundary map (measured on `next` 9c0c809, 2026-10-01)

`dist/dolly.data` is 126,928,711 bytes in 828 files
(`toolchain/CMakeLists.txt` `dolly-seed` lists them; `src/dolly.c`
`install_seed_tree` copies `/seed/usr` to `/usr` on a root build only).

| Seed item | Bytes | Why it is in the seed | Verdict |
| --- | --- | --- | --- |
| `process-bin/compiler` (Clang/LLD 24, wasm64) | 78,337,377 (61.7%) | Nothing in Dolly can produce a compiler | Must bootstrap |
| `/usr/lib/dolly/process` (musl adapter, libc, libc++ objects, `libdolly-*.a` clients, crt1) | 28,441,955 (22.4%) | Emscripten-built; every link needs it | Must bootstrap |
| Emscripten libc headers | 11,078,698 (8.7%) | Every compile | Must bootstrap |
| Clang resource headers | 7,907,501 (6.2%) | Every compile | Must bootstrap |
| `libclang_rt.builtins.a` | 812,590 | Every link | Must bootstrap |
| Dolly headers `/usr/include/dolly` | 53,443 | The engine compiles before any recipe; `bootstrap.dm` re-pins the same headers by `SOURCE` | Must bootstrap (double-provisioned, see open questions) |
| ABI contracts (`dolly-kernel-plugin-0`, `dolly-process-0`, `dolly-threads-0` wasm) | 926 | The compiler stamps and validates executables against them | Must bootstrap |
| `process-bin/bootstrap` | 38,205 | The first process; compiles the engine | Must bootstrap while the engine is compiled in-sandbox |
| `dollyfile.c`, `sha256.h`, `fs-record.h` | 94,944 | The engine runs the recipe; it cannot be built by a recipe | Must bootstrap |
| `slop.c` | 162,657 | `SLOP` is the only command step, so `/bin/slop` had to exist before line one of any recipe | Recipe (`modules/slop.dm`) |
| `cc.c`, `cxx.c`, `ld.c`, `ar.c` (5 lines each) | 520 | Recipes compile through `SLOP cc`, so the proxies had to precede the shell | Recipe (`bootstrap.dm`, inline `FILE` bodies) |
| `mkdir.c`, `rm.c` | 6,040 | `make.dm` needs `mkdir`; `core-tools.dm`, `tar.dm`, `cpp.dm`, `session-recovery.dm` need `rm`; nothing before `core-tools` does | Recipe (`core-tools.dm`) |

So everything movable is 171,282 bytes, 0.13% of the seed. The change is
about identity and modularity, not download size: the compiler and its
sysroot are 99.8% of the seed and stay.

What depended on `/bin/slop` existing before the first recipe line:

- `SLOP` steps (`dollyfile.c` `run_slop` spawns `/bin/slop -e -c`).
- `EXPORTS TOOL slop` and `EXPORTS ENV SHELL /bin/slop` in `bootstrap.dm`.
- Nothing else: `ENTRY /bin/slop` is checked at sealing (the target must be a
  retained file, so a bare root image never worked without a module exporting
  Slop); `init.slop`, session recovery, the page's terminal and every custom
  or test recipe run on a built image (`FROM …`) where Slop is retained;
  `bootstrap.c`'s messages are not asserted by any test.
- The engine itself never calls a shell or an external command: `SOURCE`,
  `FILE` and control files use `mkdir_parents` and `dolly_write_file`.

## Decision memo

### What stays in the seed and why

The seed is the toolchain: the compiler executable, the process sysroot it
links against, the headers it includes, compiler-rt and the ABI contracts it
stamps. None of these can be produced by a recipe because producing them
needs a compiler. The engine stays as source plus the 125-line bootstrap that
compiles it, because the engine is what runs recipes. Everything that is an
ordinary C program compiled by the seed compiler (Slop, the four toolchain
proxies, `mkdir`, `rm`) is built by recipes.

### `COMPILEC` (chosen) against an argv-only `RUN`

`COMPILEC /source.c /program` runs the seed compiler as
`cc -O1 /source.c -o /program` with stdin `/dev/null` in `/`: no shell, flags
or expansion; failure stops the build. It is exactly `bootstrap.c`'s
`compile_source()` moved into the language.

| | `COMPILEC` | `RUN /program argument…` |
| --- | --- | --- |
| Scope | The programs needed before a shell exists: Slop and the proxies (single C files) | Any program with any argv; a second general exec form beside `SLOP` |
| Language | Two absolute paths, fixed arity | Unbounded argv with its own limits (as `ENTRY`), quoting rules shared with `SLOP` |
| Engine | One spawn helper shared with `run_slop` (+9 lines) | Same size |
| What recipes see | Nothing of the seed layout; the compiler path and `--dolly-toolchain-mode` stay inside the engine and the `cc` proxy | The seed path and mode flag appear in recipes, which `bootstrap.dm` deliberately leaves open |
| Can build | One C file at `-O1`; enough for every pre-shell program | Multi-file programs, C++, `ld`, `ar` before the shell: not needed by anything, since `SLOP cc` is available two steps later |
| AGENTS.md | Small, typed, names its purpose | A generic escape hatch that "might be useful" |

Alternatives rejected: an engine that compiles by itself (linking LLVM into
the engine), shipping Slop precompiled from the host (moves a bootstrap
exception the wrong way), keeping a minimal shell in the seed (status quo).

`COMPILEC` is C only, one source, fixed `-O1`; multiple sources, C++ or
flags would be added only when a real recipe needs them. A root build that
needs more compiles the proxies first and uses `SLOP cc`.

### The engine

The engine stays the only bootstrap-compiled program. It could instead be
linked by Emscripten like the compiler and shipped precompiled, which would
delete `bootstrap.c` and `/etc/dolly/recipe.locator` (the worker would spawn
`/bin/dollyfile LOCATOR` in both the root and the resumed case) at the cost of
a new host-built bootstrap exception and moving the engine's identity from
the recipe-visible seed source to a host link. Owner decision; not done.

### Identity and language version

Slop, the proxies, `mkdir` and `rm` now enter images through their recipes:
`slop.c` is a pinned canonical source (`/static/default/slop.c`), the proxies
are `FILE` bodies hashed by `bootstrap.dm`, `mkdir.c`/`rm.c` are pinned
sources of `core-tools.dm`. `DOLLY 5` is kept: `COMPILEC` adds a declaration;
no existing recipe changes meaning, and recipes never cross engine versions
because every release ships its engine with its pinned catalog.

### Fit with audit-36 (in-house core tools against sbase)

It fits. `core-tools.dm` exists because `system-build` needs `ls`, `cp`, `mv`,
`test`, `cat`, … before Make, and sbase is built by Make in `system-tools`.
With Slop and `cc` available from the second module, a `system-build` recipe
can compile sbase's single-file tools plus `libutil`/`libutf` directly with
`SLOP cc` (several sources on one line; no `COMPILEC` extension needed) before
Make exists, and most of `core-tools.dm`'s 1,180 inline lines can go. That is
a separate change: audit-36 should start from this branch's ordering
(`bootstrap`, `slop`, then tools).

## Prototype (branch `work/bootstrap-boundary`, from `next` 9c0c809)

- `src/dollyfile.c`: `COMPILEC` declaration; `run_program` shared by
  `run_slop` and `run_compiler`.
- `src/dollyfile-view.mjs`: the JavaScript parser accepts the same syntax;
  `test/fixtures/dollyfile-syntax.mjs` adds eight parity cases.
- `src/process/bootstrap.c`: compiles only `/bin/dollyfile`, then runs the
  recipe (145 to 125 lines). `toolchain/CMakeLists.txt` seeds only the engine
  source; `src/process/{cc,cxx,ld,ar}.c` deleted.
- `modules/slop.dm` (new): `SOURCE` + `COMPILEC` + `EXPORTS TOOL slop`,
  `EXPORTS ENV SHELL`. `modules/bootstrap.dm`: inline proxies + `COMPILEC`,
  exports only `cc`, `c++`, `ld`, `ar`, `dollyfile`. `modules/core-tools.dm`:
  `mkdir.c` and `rm.c` join the other inline command bodies
  (`src/commands/{mkdir,rm}.c` deleted; the module test keeps core-tools
  source-free). `Dollyfile-system-build` uses `slop.dm` second.
- `scripts/prepare-image-sources.sh` stages `slop.c` as
  `/static/default/slop.c`.
- Docs: `docs/dollyfile.md`, `docs/sources.md`, `docs/architecture.md`.
- `test/dollyfile-modules.test.mjs` expects the new export sets and that
  `slop.dm` has no `SLOP` step; `test/dolly.artifacts.mjs` keeps checking that
  the engine source is not retained.

### Measurements

| | `next` 9c0c809 | prototype |
| --- | --- | --- |
| `dist/dolly.data` | 126,928,711 B | 126,757,429 B (−171,282) |
| `build/process-bin/bootstrap` | 38,071 B | 37,036 B |
| `npm run build:runtime` (warm) | 63 s | 13 s (no kernel relink) |
| system-build cold root build, per-image timer (Chrome launch to verified snapshot), interleaved A/B under the same load, three pairs | 15.4 s, 13.2 s, 15.7 s | 16.8 s, 14.2 s, (30.8 s during a load spike, discarded) |
| system-build snapshot | 136,778,412 B (2069 paths) | 136,796,327 B (2070 paths: `slop.dm` is retained; `core-tools.dm` grew by the inlined `mkdir.c`/`rm.c`) |
| `DOLLY_BUILD_IMAGES=default npm run image`, cold (system-build, zig-build, ghostty-build, system-tools, system, default) | not measured | 13 m 33 s wall, 805.8 s in Chrome |

The prototype's root build is about 1-1.5 s (8%) slower: `mkdir` and `rm`
now compile through `slop`, `cc` and the compiler (three process starts per
`SLOP cc`) instead of one direct compiler spawn from the bootstrap; the
compiler itself starts eight times either way. Single uncontrolled samples
on this shared machine ranged from 13.5 s to 38.3 s, so only the interleaved
pairs are reported. Each variant's snapshot reproduced byte-for-byte across
its three builds (`906312c5…` base, `ca574d85…` prototype).

Root-build log order after the change: `compiling /usr/src/dolly/dollyfile.c`,
then `+ COMPILEC` for `cc`, `c++`, `ld`, `ar`, then `SOURCE … slop.c` and
`+ COMPILEC /tmp/slop/slop.c /bin/slop`, then `core-tools` and the rest.

Tests (2026-10-01): `npm run test:source` 342/343 (the failure is
`demos/rust/test/patti.test.mjs`, a `patti.dm` SOURCE pin that is identical
on `next` 9c0c809 and stale there; nothing under `demos/rust` was touched);
`node --test 'test/*.artifacts.mjs'` 21/21 (with the `default` closure built);
`node test/browser-tests.mjs chromium firefox` all 18 suites pass in both
browsers (803 s; `audio` needed `audio-sdk` built as well, `gpu-render` is
skipped by the runner).

## Open questions for the owner

1. Ship the engine precompiled and delete `bootstrap.c` (above), or keep the
   in-sandbox compile as the only bootstrap exception beyond the toolchain?
2. The Dolly headers are provisioned twice: in the seed (for the engine
   compile) and as `SOURCE` rows in `bootstrap.dm` (for the pin). Either is
   defensible; removing the `SOURCE` rows would drop the header pins from the
   recipe graph.
3. `mkdir` and `rm` sit in `core-tools.dm` for now; audit-36 decides whether
   they survive sbase at all.

## Decisions (2026-10-01, delegated)

- Keep compiling the Dollyfile engine in-sandbox: a precompiled engine would add
  a host-built bootstrap exception for 95 KB of source.
- Keep headers in both places for now: the engine needs them before any recipe,
  and `bootstrap.dm` pins them for images.
- `COMPILEC` stays C-only, single-source, `-O1`; widen it only for a real need.

## Closed (2026-10-01)

`COMPILEC` shipped in the release candidate: Slop and the compiler front ends
are built by recipe, the seed compiles only the Dollyfile engine, and every
suite passes on the candidate. The open questions are decided above; folding
sbase into system-build continues in `20260930-100000-audit-36`, and the
language itself in `20261001-214000-dollyfile-v6`.
