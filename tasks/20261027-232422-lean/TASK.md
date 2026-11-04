# Lean 4 as an amy package, built inside Dolly from upstream's stage0

- STATUS: OPEN
- PRIORITY: 60
- TAGS: packages,demo,lean,0.1.5

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

## State (2026-11-05 night): the 6 GB browsers measured on the night round's images

Tagged `0.1.5` (it was `0.1.4`, which shipped without it): the done-when names the domain's
catalog, which only a release publishes.

Done: the four images, `amy install lean` on `default`, `lean --run`, the four theorems and the
false one, `lake new` and `lake build`; `demos/lean/test/lean-browser.mjs` in Chromium (40.8 s) and
Firefox (56.5 s) in the round of 2026-11-04 (`round-1104b`, its 36 GB scope); the
`test/amy-browser.mjs` row, the pin and the licence row; the staging comment
(`demos/lean/prepare-sources.sh`: the plain tar is for the archive's seven symlinks, 2af0c32c3).

Left: the demo test in a 6 GB slot (below, measured on the night round's images), and the
release's checks of the domain's catalog (below).

## The domain's catalog: what the release must check (2026-11-04)

`config/domain-pages-images.txt` lists `lean-std`, `lean-meta` and `lean`, and `default`, `cc`
and `libuv`; the build's closure (`selectImageDefinitions`) adds `lean-stage0`, `stack-wrap` and
the rest of the chain. `amy install lean` reads only package snapshots: `lean`'s records name
`lean-std`, `lean-meta`, `cc` and `libuv`, all packages of that closure, and `amy-index.txt`
lists every package the closure holds. So the list is complete. The release checks:

1. The domain build registers the three packages: `grep -E '^lean(-std|-meta)? '` on the sealed
   release's `amy-index.txt` prints three rows whose pins are those `Dollyfile-lean`'s
   `INSTALL` rows name.
2. `export-cloudflare-pages.mjs` stays within Pages' limits; it fails, naming the versions, when
   it does not. Lean adds about 670 files (packs: `lean-std` 217, `lean-meta` 387, `lean` 42,
   `lean-stage0` 22, 15 of them shared with other images; four packs over 25 MiB in 20 MiB parts; the
   74 MB `lean.tar.gz` in four parts) and five `_headers` rules: one per split file
   (`libLean.a` 39.5 MiB gzipped, `lake` 33.0, `lean` 30.9, stage 0's `lean` 30.9, and the
   source). Measured on 2026-11-02, five versions needed 92 of the 100 rules and 0.1.4 alone 55
   (6 per version, 37 large sources, 12 large packs); a compiler round changes every large
   pack's bytes. Counted on this tree's snapshots of the domain's 188 images
   (`build/lean-evidence/night/large-packs-domain.log`, a record over 25 MiB gzipped is a pack
   of its own): the compiled programs among them (the compiler, `codex`, `rustc`, `zig` and
   Lean's four) get new bytes in 0.1.5, so new rules; the eight data files (five models,
   parakeet, Xonotic's two `.pk3`) keep their bytes and the rules they have. That is about 92 + 6
   + 8 or 9 + 1 (`lean.tar.gz`) = 108 rules: over the 100, unless a version is removed or the
   rules stop growing with packs, which is the release's decision.
3. On the packaged candidate (`npm run serve build/domain-releases`), in `default`:
   `nena enable stack && amy install lean && lean --version`. No test runs `amy` against a
   sealed release (`published-version.mjs boot` boots `default` only), so this is by hand, in
   one browser.

## Compiled modules wait for a collection (2026-11-04 night)

Measured on the night round's runtime (image inputs `88959af6`) before its Lean images were
packaged, with `build/lean-evidence/night/lean-measure.mjs`: each step's highest scope memory
(sampled every 250 ms), each browser process's anonymous memory, and the largest one's mappings
by name (Firefox names `wasm-reserved`, `js-executable-memory`, `jemalloc`; Chromium
`v8-sandbox`, `partition_alloc`).

- Compiling `lean` (214 MB) in a page Worker, outside Dolly (`probe/compile-ways.mjs`):
  Firefox peaks 0.8 to 1.4 GB above its floor and retains about 0.5 GB; Chromium peaks
  0.2 GB and retains nothing until functions run (lazy compilation). `compile`,
  `compileStreaming` and the synchronous `Module` differ by less than runs do.
- A dropped Module goes only at its realm's next collection: in Firefox `lean`'s, dropped
  before `lake` was compiled, was still resident 30 s later (`probe/compile-memory.mjs`).
  Compiled code does not count toward a collection; ending the Worker frees it at once.
- In Dolly the supervisor compiled every executable in the runtime Worker and held the Module
  there. Four distinct 96 MB executables launched in turn three times (`thrash5.sh`; the cache
  holds two): Firefox kept up to five compiled (`js-executable-memory` 1.32 GB, where two are
  0.53), the steps' highs reached 3.6 GB and the scope peaked at 3.63 to 3.88 GB; idle 40 s
  later it was 1.82. Freeing the supervisor's copy of the bytes at once (`transfer(0)`, which
  measured frees a buffer at once in both browsers) did not lower that: fewer malloc'd bytes
  made the collection later (peak 3.88).
- Now a module of 16 MiB or more is compiled in a Worker of its own, which posts it to each
  process Worker on a channel, and which the supervisor ends once neither the cache nor a
  process holds the module. The same run: Firefox holds exactly the two cached
  (`js-executable-memory` 0.53 throughout), the steps end at 1.90 to 2.01 GB instead of 2.02 to
  3.35, the scope peaks at 2.99 GB instead of 3.63; Chromium is unchanged (peak 1.79 against
  1.77). A cold launch takes 0.1 to 0.2 s longer in Firefox (a fresh Worker), the same in
  Chromium. `test/process-browser.mjs` counted the page's Workers from its start; it now counts
  them once the compiler has run, whose Worker stays while the cache holds its module.
  Passed in Chromium and Firefox: `process`, `threads`, `core`, `process-memory`, `ending`,
  `dso`. With every module held (`heldModuleBytes` 0, a check, which sends threads' modules on
  channels too), `threads` passed, then in the same run `core` exceeded its 120 s in Firefox
  and `process-memory`'s Firefox half printed nothing for six minutes; alone, each passed in
  Firefox (63 and 64 s), and `core` again in both (26.5 and 44.3 s). Not attributed: the machine
  was building the round's LLVM beside it. An idle Worker costs 2.2 to 2.5 MB and starts in
  4 ms (`probe/worker-cost.mjs`), so the threshold keeps small programs as they were.
  `stack` and `ended-worker` open an image with `stack-wrap`, whose snapshot in this tree is the
  previous round's: they time out at boot with the supervisor unchanged as well; the night
  round rebuilds it.

## Measured (2026-11-02): `demo/lean-3`, on `integrate/2026-11-02`

Against the done-when, 12:45: met in Chromium, in a 6 GB slot: `amy install lean` on `default`
from the round's catalog, `lean --run`, the four theorems, the false one with status 1, `lake new`
without Git, `lake build` and the program, and `demos/lean/test/lean-browser.mjs` (52.6 s, with
`core/process-memory`). In Firefox the same steps pass up to `lake new`, where the 6 GB cap kills
the tab (about 7 GB needed). The `test/amy-browser.mjs` row, pins and licence rows are in. Not
verified here: the domain's catalog (`config/domain-pages-images.txt` lists the three packages;
the round's publish stage packages it) and Firefox at a larger cap (the round's suites).

`demo/lean-2` is merged in `integrate/2026-11-02` (`fa949c1b`); the catalog round of that
branch builds Lean's four images one at a time in a 36 GB scope. On the branch, with the
round's images linked into this tree (same recipe hashes and build id, image inputs
`a58af3f9`), amy's installs, threads, memory growth and `core` pass in Chromium and Firefox,
and six dead processes of 512 MiB leave at most one resident (two with threads in Firefox).

The round built `lean-stage0` in 603 s and `lean-std` in 2,466 s. On the page-built image of the
two (`build/lean-evidence/day/spawn-check.mjs`), stage 0's lean runs `IO.Process.output { cmd :=
"nosuchprogram" }` and prints `error: no such file or directory (error code: 44)` naming it, where
it crashed before: Chromium. In Firefox the tab was killed while the page built that image
(`lean-std` copied in beside `lean-stage0`), the builder's memory, not Lean's.

The round built `lean-meta` in 3,428 s and `lean` in 1,179 s; in its build `lean --run`, a
theorem by `omega`, and `lake new greeting && lake build` and the program pass. In `default`
(`build/lean-evidence/lean-measure.mjs`, the test's steps without git, a 6 GB browser slot, the
scope's memory, anonymous in brackets):

| Step | Chromium | Firefox |
| --- | --- | --- |
| `nena enable stack && amy install lean` | 45.6 s, at most 4.57 GB (4.02), 3.98 after | 71.5 s, at most 6.44 GB (4.67), 4.55 after |
| `lean --run squares.lean` prints `285 0149` | 2.0 s | 3.1 s |
| `lean theorems.lean` (`rfl`, `decide`, `simp`, `omega`) | 1.1 s | 1.8 s |
| `lean wrong.lean`, status 1 | 1.2 s | 3.9 s |
| `lake new greeting` (no git: a warning) | 0.9 s | killed by the cap |
| `lake build`, then the program prints `Hello, world!` | 7.5 s, anonymous at most 6.05 GB | |

After merging `core/process-memory` (`761d0cb8`: a process's memory lives in its Workers alone and
goes with them), same steps, same slots (anonymous memory, the step's highest, then after it):

| Step | Chromium before | Chromium after | Firefox before | Firefox after |
| --- | --- | --- | --- | --- |
| install | 4.02, 3.98 | 4.03, 3.98 | 4.67, 4.55 | 4.67, 4.52 |
| `lean --run` | 4.83, 4.35 | 4.81, 4.36 | 4.99, 5.47 | 5.85, 5.43 |
| theorems | 4.93, 4.91 | 4.88, 4.89 | 5.94, 6.00 | 5.90, 5.44 |
| false theorem | 5.42, 5.48 | 4.89, 4.65 | 6.38, 5.48 | 5.95, 5.44 |
| `lake new` | 5.84, 5.23 | 4.83, 4.32 | killed | killed |
| `lake build` | 6.05, 5.14 | 5.58, 4.84 | | |

Dead processes no longer pile up: in Chromium the test now ends 1.3 GB lower, and
`demos/lean/test/lean-browser.mjs` passes (52.6 s). In Firefox a live `lean` takes about 1.4 GB
above the 4.5 GB the session holds after the install (0.85 in Chromium, above 4.0), and the
cap kills the tab at `lake new`, in the test too: Firefox needs a cap of about 7 GB for it.
The thread count is not it (`build/lean-evidence/day/threads-cost.mjs`: `lean -j1`, `-j2` and the
default each add about 0.5 GB while they run, in both browsers). The first `lean` leaves 0.8 GB
behind in Firefox and 0.3 GB in Chromium after it ends, and later ones nothing: most likely the
compiled module of the 214 MB `lean`, which the supervisor keeps compiled; `lake`, as large, then
adds its own. Not measured apart.

`test/amy-browser.mjs`'s row: its check that every package of the catalog is installed by a
test or names where (`elsewhere`), evaluated against the round's full catalog (136 packages,
`work/integrate/dist/dolly-images.mjs`, the browser tests stubbed), passes with `lean`,
`lean-std` and `lean-meta` in it; the file's browser tests run in the round's suites.

The install's kernel side is now the package's size: anonymous 3.98 GB after it in Chromium
where it was 5.22 before the last-use rule. Chromium passed the measured steps three times and
`demos/lean/test/lean-browser.mjs` crashed once at `lake build`: each `lean` that ends stays
resident until a collection (`tasks/20261101-102515-retained-process-memory`), so the
anonymous memory rises by about half a GB a step to 6.0 GB, at the 6 GB cap. In Firefox it rises
faster and the cap killed the tab at the fourth process. The test needs about 7 GB in Chromium
and more in Firefox; the round runs it in its 36 GB scope. A second report of a threaded
process's memory a second after it ends kept none resident in the six-run test in Chrome (one
in Firefox) but did not move these numbers, so it is not made.

## Built (2026-11-01): `demo/lean-2`, on `main`

`demo/lean-2` is `demo/lean` replayed on `main` (v0.1.4), with `core/install-memory` and
`core/thread-memory-max`, each judged in its own task, and what tonight added:

- `lake new` without Git: the patch's spawn threw posix_spawnp's error as an `int`, which
  upstream's `lean_io_process_spawn` decodes without a file name, and ENOENT's needs one, so a
  missing program crashed Lean (`IO.Process.output { cmd := "nosuchprogram" }` did too). Now the
  spawn returns an IO error naming the program, closing the pipes it made, and Lake's handler
  turns `git init` failing into a warning, as a forked child exiting 255 does upstream.
- `lean-symbols.c`'s `main` check, which never matched (WebAssembly names `main(argc, argv)`
  `__main_argc_argv`), is gone; `lean-dolly.mk` leaves `libLeanExport.a` out of lake's table,
  which the recipe overrode `LAKE_LIBRARIES` to do. The new tool on the new list writes the
  table the old one wrote on the recipe's list, byte for byte (86,540,368 bytes).
- The install's kernel memory (`tasks/20261030-084000-install-snapshot-file`, a seed change): the
  kernel held each package twice, and a Wasm memory never shrinks.
- A process's memory takes its maximum before its second thread, in a Worker that ends after it
  (`tasks/20261030-090000-chrome-grown-memory`): kept in a lasting Worker, every `lean` with
  threads stayed resident after it ended, and the `lean` image build was killed by its 9 GB cap.

Built before tonight, in `work/lean` (Chrome, `slot.sh bigbuild`, 9 GB cap; memory is the scope's
anonymous memory, sampled every 10 s, then the cgroup peak with page cache):

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
  and linked a second `main`).
- Jobs: `lean-meta` at four was killed by the 9 GB cap once (and passed once at 7.9 GB);
  `lean` at four was killed within a minute.

Tonight's builds (`work/lean`, `slot.sh bigbuild`, 9 GB cap, Chrome): `lean-stage0` 644 s,
`lean-std` 2,043 s, `lean-meta` 2,483 s, each with the patch and makefile above; the `lean` image
was killed by the cap twice in its first minutes, compiling `LeanExport` and `Lake` (each
`lean` imports `Lean`, 1.7 GB, beside the kernel's copy of `lean-std` and `lean-meta`, files and
snapshots, about 4.7 GB at its high-water). `lean-meta` was killed once too, copying its finished
image. Two causes, fixed in the core: dead processes stayed resident until the runtime Worker
collected garbage (`tasks/20261101-102515-retained-process-memory`), and a build's `INSTALL`
copied a package's files out of its snapshot beside it (the engine now moves them out of the
snapshot at its last use, a build's as a session's: `tasks/20261030-084000-install-snapshot-file`).

With both fixes and the seed they need (image inputs `36d3ff59`), `lean-stage0` (623 s) and
`lean-std` built again, and `lean-meta` compiled all its modules, then was killed by the cap
again while the page copied and verified its finished 1.58 GB image (it passed so once tonight,
at 21:51, and failed so at 20:59): the kernel's serialized image beside its files, the Worker's
copy and the page's digest (`src/build-worker.mjs`, `src/image-builder.mjs`) hold the image three
or four times while the kernel's memory awaits release. That is the image builder's, beyond this
task: an image near the 2 GiB bound needs more than a 9 GB build to be captured. A third try
captured it (1,866 s, 00:25); the `lean` image was then killed by the cap a third time, at Lake's
first module, with `lean-std` and `lean-meta` installed once (the last-use rule). Built in a
9 GB scope, Lean's images are a matter of luck tonight; the catalog round should give them more. Its anonymous
memory while it compiled was 3 to 5 GB (sampled at 21:10), against a 7.4 GB peak on 2026-10-29.

Not done:
- The `lean` image is not built with tonight's fixes, so `lean --run`, the theorems, `lake new`
  without Git and `lake build` are not measured in `default`, nor the demo test
  (`demos/lean/test/lean-browser.mjs`) in Chromium and Firefox. Before them, the install itself
  was measured (`build/lean-evidence/lean-measure.mjs`, Chromium, 6 GB slot): the whole scope at
  6.31 GB during `amy install lean git` and 5.99 GB (5.22 anonymous) after it, then the cap.
- `test/amy-browser.mjs`: Lean's row is the `elsewhere` entry (`lean`, `lean-std`, `lean-meta`:
  `demos/lean`); the file's own check needs the full catalog, not built here.
- Stage 0's `lean` failed twice with `memory access out of bounds` in about 6,000 runs: Chrome's
  late view of memory another thread grew (`tasks/20261030-090000-chrome-grown-memory`).

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

## Lessons

- A Wasm memory never shrinks, and the browser frees a dead process's only when an isolate
  collects garbage: what an install or a build holds for a moment, the tab holds for good or
  until a collection nobody schedules. Measure a step's high-water and what stays after it,
  not its end state.
- Resolving a cherry-pick's pin conflicts with "ours" silently dropped the commit's other lines
  in the same files (`REQUIRES TOOL stack-wrap`); taking "theirs" and regenerating the pins,
  then diffing the result against the source branch, replays a recipe branch faithfully.
- RSS alone hid the cost of growing a shared memory to its maximum: Firefox charges all of it to
  Linux's commit limit and Chrome none (`smaps` flags `ac`, measured per mapping). A cost that
  differs by browser has to be measured in both before a fix is chosen.
- A tree's test server serves its working files: with `Dollyfile-lean` edited and not yet
  built, `amy install lean` failed with HTTP 502, the page checking the served recipe against the
  package's. Keep an image's inputs still while it is tested or built.
- Only what a build replaces by rename may be hard-linked between trees (`*.snapshot`,
  `dist/packs`): on 2026-11-02 a script here linked the round's catalog and metadata modules
  too, a cache-hit `npm run image` in this tree rewrote `dist/dolly-images.mjs` in place with 23
  images, and three images of the round in `work/integrate` failed with it; the light stage
  restarted. Copy every other file, and check `find dist -type f -links +1` before a build.
- A large program's first run leaves its compiled module behind (most likely; 0.8 GB for
  `lean`'s 214 MB in Firefox, 0.3 in Chromium): a browser slot's budget for a test of big
  programs is the session plus each one's compiled code, which differs by browser.

## After the process-memory revert (2026-11-03 00:40, integrator)

`core/process-memory` is reverted on integrate (lean-std and lean-meta crashed Chrome with it;
`tasks/20261101-102515-retained-process-memory`). On the reverted runtime the whole Lean chain builds
(lean-std 789,745,795 bytes, lean-meta 1,581,471,990, lean 685,090,950; about an hour in a 36 GB scope),
and `demos/lean/test/lean-browser.mjs` passes in Chromium in a 12 GB scope (65.4 s); in a 6 GB slot
Chromium is killed at `lake new` and `lake build`, as before the change. Firefox ran past the test's
1,200 s in 12 GB. Lean in a 6 GB Chromium and in Firefox wait for the process-memory work's return.
