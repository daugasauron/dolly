# Lean 4 as an amy package, built inside Dolly from upstream's stage0

- STATUS: OPEN
- PRIORITY: 60
- TAGS: packages,demo,lean,0.1.4

Owner (2026-10-28): "I want to add lean to amy."

Lean 4 (`leanprover/lean4`, upstream's newest stable release) as a package: `amy install lean`
gives `lean` and `lake` with Lean's own library (`Init`, `Std`, `Lean`), built inside Dolly
from upstream's sources as OCaml is (`demos/ocaml`): upstream's `stage0` (the C of the previous
compiler) builds the first `lean`, which builds the release the way upstream's CMake does.
Nothing of the compiler is built on the host; a configure step outside Dolly is a bootstrap
exception the demo's README states.

## Done-when

- `amy install lean` works on `default`, from the full catalog and the domain's.
- `lean --run` of a file with `def main` prints its output; `lean FILE` accepts a theorem
  proved by `rfl`, `decide`, `simp` and `omega`, and rejects a false one with status 1.
- `lake new`, `lake build` and the built executable run, compiled to C and linked with `cc`
  (the package names what it needs from amy).
- A demo test passes in Chromium and Firefox; the package has its row in `test/amy-browser.mjs`;
  sources are pinned, with licence rows.

## State (2026-10-30 01:25): the four images build; the demo test needs more than a 6 GB slot

Built in `work/lean` (Chrome, `slot.sh bigbuild`, 9 GB cap; memory is the scope's anonymous
memory, sampled every 10 s, then the cgroup peak with page cache):

| Image | Time | Memory | Snapshot |
| --- | --- | --- | --- |
| `lean-stage0` (`-j4`) | 463 s | 3.5 GB (6.3) | 378 MB |
| `lean-std` (`-j4`) | 1,620 s | 6.7 GB (7.3) | 790 MB, 217 packs |
| `lean-meta` (`-j3`) | 1,921 s | 7.4 GB (8.7) | 1.58 GB, 387 packs |
| `lean` (one job) | 959 s | 7.2 GB (9.2) | 685 MB |

In `lean`'s build: `lean --run` of a program prints 285, a theorem by `omega` checks, and
`lake new greeting && lake build` compiles, links with `cc` and runs the program.

Fixed on the way:
- Core `7a55caa1`: a build enables `stack@0` (it admitted the module without serving it, so stage
  0's wrapped `lean` trapped `unreachable` at `--version`); `Dollyfile-stack-wrap` checks a
  rewritten recursion in its build. `dolly-docs` and the 10 images that hold it are repinned.
- Core `c88bd37b`: the pack bound follows the image bound (256 packs refused `lean-meta`).
- `20e781cf`: `IO.Process.spawn` asks for default signal dispositions (Lake's children failed with
  `ENOTSUP`: a Dolly child cannot keep the `SIGPIPE` Lean ignores).
- `d80cd691`: lake's symbol table leaves `libLeanExport.a` out (its `LeanExport.o` is a program's
  and linked a second `main`). The `main` check `20e781cf` put in `lean-symbols.c` never matches:
  WebAssembly names `main(argc, argv)` `__main_argc_argv`. It goes, with the recipe's override or
  for a `__main_argc_argv` check, at the next rebuild of all four images (it is in `port.tar`).
- Jobs: `lean-meta` at four was killed by the 9 GB cap once (and passed once at 7.9 GB);
  `lean` at four was killed within a minute.

Not done:
- `demos/lean/test/lean-browser.mjs` (`nena enable stack && amy install lean` in `default`):
  Chromium in a 6 GB browser slot was killed by the cap 16 s into the install (anonymous
  4.0 GB at the last sample). The install's kernel high-water is about 4.6 GB (`lean`'s snapshot
  while its rows install, `lean-std`'s files, `lean-meta`'s snapshot and its files) beside a
  page of 1.5 GB, and the page merges each package's packs into one buffer (twice the package
  while it merges). The test needs a larger cap; Firefox not run.
- `test/amy-browser.mjs`: Lean's row is the `elsewhere` entry (`lean`, `lean-std`, `lean-meta`:
  `demos/lean`); the file's own check needs the full catalog, not run here.
- Stage 0's `lean` failed twice with `memory access out of bounds` in about 6,000 runs
  (`Init/Data/Range/Polymorphic/IntLemmas`, `Lean/Data/RBMap`), each passing in the next build;
  the cause is not found. Not it: memory growth followed by a kernel read into the new pages
  (240,000 rounds in four processes) or a thread reading a page another grew (240,000 hand-offs).
  Native `lean -j4` runs 8 to 12 threads, so four at once approach the page's 64 thread Workers.

## Measurements (Chrome, in a browser slot, 6 GB cap)

- Stage 0, `-j4`: the C++ runtime and kernel, 51 files, 43 s; stage0's 2,371 C files 342 s
  (the largest, 5.8 MB, in about 6 s); `lean` links to 188 MB (its symbol table is
  82 MB of C and a 63 MB object). `lean --version` takes 0.5 s cold, 0.17 s cached.
- Stage 0's `lean` on `Init/Prelude.lean` dies with `Maximum call stack size exceeded`
  after 2.5 s when entered directly; with the `dolly.process.stack` section (Chrome's
  `promising` stack, about 950 KB) it compiles in 6.0 s.
- Stage 1's `.depend` files, one `lean --deps` per module, all 2,561 at four jobs: about
  2.5 min. 46 modules of Init were built in 160 s, then the browser was killed by the
  6 GB cap (renderer 4.4 GB, cgroup peak 6.1 GB): the kernel kept stage 0's files
  (2 GB of sources and objects) while four `lean` ran. One process before that died
  with `memory access out of bounds` and passed alone (allocation failure under the cap).

## Findings (v4.35.0, read in the source and measured on the Linux release)

- The source archive is 90 MB gzipped, 693 MB unpacked: `stage0/stdlib` is 598 MB of C in
  2,544 files (Lean 486 MB), `stage0/src` is upstream's copy of `src/`'s C++ (identical but for
  `CMakeLists.txt`), `tests` 54 MB.
- Upstream's build cannot run as it is: `stdlib.make`, `lean.mk`, `leanc.sh` and `leanmake` are
  Bash (Dolly has none), the libraries are linked into `libleanshared.so` and Lake loads
  `libLake_shared.so` with `--plugin`, `lean.mk` hard-links (`ln -f`), and stage 1 fetches
  mimalloc, CaDiCaL and leantar with git or a download. So `demos/lean/lean-dolly.mk` does what
  CMake and those files do, statically.
- Lean's interpreter finds compiled code with `dlsym(RTLD_DEFAULT)` (`-rdynamic`); Dolly's
  `cc` refuses `-rdynamic` with `-pthread`. Without it an `@[extern]` call fails, so `lean`
  and `lake` are linked with a generated table of the symbols `-rdynamic` would export
  (`demos/lean/lean-symbols.c`); the release's `libleanshared.so` exports 229,738 (24.6 MB
  of names).
- `IO.Process.spawn` forks; Dolly has no `fork`: the patch spawns with `posix_spawnp`.
- 4.35 requires OpenSSL 3 off Emscripten, but only for `lean_openssl_version`.
- `.olean` loading tries `mmap` at a fixed address and falls back to `read`; built without
  `LEAN_MMAP`, as Dolly's `mmap` copies anyway.
- Task threads get a 1 GiB stack on 64-bit; Emscripten's 8 MiB is used.
- The Linux release unpacks to 3.1 GB: `lib/lean` holds 2.2 GB of `.olean`, `.olean.private`,
  `.olean.server`, `.ir` and `.ilean` (Init 405 MB, Std 347 MB, Lean 1,341 MB, Lake 116 MB),
  `libLean.a` 312 MB. A module of the module system is imported with all three `.olean` parts
  ("opportunistically load all available parts"), so a file importing only `Init` reads
  366 MB, and one importing `Lean` about 1.7 GB, into its process. A package over 2 GiB cannot
  be installed, so the package cannot hold everything; see the decision below once measured.
- `lake new` writes `lakefile.toml` by default, which Lake reads without elaborating Lean.

## Decision: four images (2026-10-28)

A snapshot holds at most 2 GiB (`MAX_SNAPSHOT_BYTES`) and the release's libraries are
about 2.9 GB, so no image can hold them all, and every Lean program links `libLean.a`
(upstream's static flags name `-lLean`). The release is therefore built in parts, each
from `lean-stage0`'s first lean, which compiles into `/usr/lib/lean` beside what the
installed parts hold:

- `lean-stage0` (toolchain): the first lean, 188 MB.
- `lean-std` (package): `Init` and `Std`, `.olean` files and archives, about 0.8 GB.
- `lean-meta` (package, installs `lean-std`): `Lean`, about 1.6 GB with `libLean.a`.
- `lean` (package, installs both, `cc` and `libuv`): `lean`, `lake`, `leanc`, `Lake`,
  `LeanExport`, `Leanc`, the C++ runtime archives and headers.

`amy install lean` therefore brings about 3.3 GB, as upstream's release brings 3.1 GB.
Stage 1 is built with make as upstream's `USE_LAKE=OFF` does (one `lean --deps` per
module, lean.mk's rules), since Lake would need stage 0's `libLake_shared.so` plugin.

## The browser stack (2026-10-28)

- `lean-stage0` builds as an image in 446 s (cgroup peak 3.7 GB, snapshot 352 MB).
- `lean-std`'s image build (`-j3`, peak 4.0 GB) stopped at its 36th module:
  `Init/Grind/Config.lean`, 72 fields deriving `BEq`, overflows the browser's stack. Its
  interpreter trace is three frames (`_aux_Init_Notation___macroRules_term_==__2`): the
  depth is the compiled elaborator's recursion over the 72-deep `&&` term, not the
  interpreter, so nothing in Lean's code could move it to another stack.
- Measured natively with the release's `lean --tstack=KB` (its frontend runs on a thread
  of that stack): `Init/Prelude.lean` needs 512–576 KB and passes in Dolly on Chrome's
  `promising` stack (about 950 KB); `Init/Grind/Config.lean` needs 640–704 KB and fails.
  So Dolly needs about 1.4–1.7 times the native stack.
- Survey of all 1,147 modules of `Init` and `Std` natively (the release's own `.olean`
  files as imports, `work/lean/build/lean-evidence/stack-survey-init-std.txt`): 1,102 pass at
  384 KB, 26 need 576 KB, 9 need 768 KB, 7 need 1,152 KB and 3 need 1,728 KB
  (`Init/Data/SInt/Lemmas`, `Init/Data/UInt/Lemmas`, `Std/Data/DTreeMap/Internal/Lemmas`).
  Upstream gives these threads 1 GiB. About 19 to 45 modules of `Init` and `Std` cannot
  be compiled in a Worker's stack today; `Lean` has not been surveyed.
- In a session on `lean-stage0` (`make -k`, three jobs): 127 modules of `Init` build,
  `Init/Grind/Config.lean` (natively 704 KB) and `Init/Meta/Defs.lean` (natively 576 KB) die
  of the stack, and nothing else of `Init` or `Std` can be built after them.
- The release's own `.olean` files cannot stand in for Dolly's: built with GMP, their header
  flags differ (`incompatible header`).
- Stage 0 compiled at `-O2` changes nothing; at `-Os` `Init/Meta/Defs.lean` passes and
  `Init/Grind/Config.lean` still fails. Smaller code buys a little depth, not the four times
  that is missing, so the build stays at upstream's `-O3`.
- Survey of the 1,231 modules of `Lean` and `LeanExport` natively
  (`work/lean/build/lean-evidence/stack-survey-lean.txt`): 1,039 pass at 384 KB, 140 need 576 KB, 34
  need 768 KB, 15 need 1,152 KB, `Lean/Meta/Tactic/FunInd` 1,728 KB, and
  `Lean/Meta/Sym/{DSimp,Simp}/EvalGround` 2,592 KB.

## stack@0 on Lean (2026-10-29, Chrome, a browser slot)

- `stack-wrap` rewrites stage 0's `lean` from 188 to 214 MB in 0.9 s (natively built tool).
- Wrapped, it builds the 48 modules up to `Init/Grind/Config` and `Init/Meta/Defs` with status 0.
- Overhead, both programs entered through `promising` in one session: `Init/Prelude.lean`
  7.55 and 7.33 s unwrapped, 8.28 and 7.90 s wrapped (about 8 %); `Init/Notation.lean` 7.18
  and 7.01 s against 8.34 and 7.71 s (about 13 %). The earlier 6.0 s for `Init/Prelude` was on a
  quieter machine.
- The `dolly.process.stack` section is dropped: with stack@0 it only saved moves.
