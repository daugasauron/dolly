# Audit: every core and toolchain Dollyfile

- STATUS: OPEN
- PRIORITY: 250
- TAGS: audit,dollyfile

## State (2026-11-02, night)

On `audit/recipes-core` (from `integrate/2026-11-02`, 71d2603fc). Every recipe of the scope
(33 top-level, 78 in `demos/{tools,rust,llvm,local-llm,go,pi,javascript,lean,python,zig,codex,
closed-source-agent,ocaml,studio}`) was read in full with its history and checked against
`work/RECIPE-AUDIT.md`'s eight questions; the table below has a row per recipe. Measurements are
in `build/recipes-core-evidence/` on this machine (snapshot sizes, host stamps of the built
executables, the builds compared in a session of `system`). Fixes, proposals and lessons follow
the table.

## Method and measurements

- Snapshot sizes and path counts: `snapshot-sizes.txt`, from `dist/dolly-*-system-snapshot.mjs`.
- Who uses an image: every `FROM`/`INSTALL`/`USE`/`COPY` row of the catalog (`recipe-users.txt`);
  which test opens or installs it (`image-tests.txt`, and `test/amy-browser.mjs` asserts that
  every package is installed and used by a test).
- Host stamps: `host-stamps.mjs IMAGE PATH` prints the `dolly.host` section of a retained
  executable; a `REQUIRES HOST` line no executable records and no comment explains is a finding.
- Builds compared in one session of `system` (`measure-builds.mjs`, `measure-builds.log`,
  Chromium): Samurai's `util.c` at -O0/-O1/-O2 and one `cc` of its 13 sources against the
  recipe's 13-part unit build; GNU Make from its 34 sources in one `cc` against the 7-part
  amalgamation; Git at -O2 without the `NO_*` flags that deny what musl has against the recipe's
  -O0 build (compile time, size, run time).

## Per recipe

Verdicts: ok = nothing found; a number refers to the finding below.

Top level:

- `Dollyfile` (default): ok. 18 MB, 227 paths. Declares audio, dso, sockets, touch for the
  packages amy installs (documented in docs/dollyfile.md).
- `Dollyfile-system-build`: 3 (Make built from a 7-part amalgamation), 15 (stale "module"
  comments from the .dm days). 129 MB.
- `Dollyfile-system-tools`: 4 (Samurai built from a 13-part unit with util.c at -O0), 15.
  156 MB.
- `Dollyfile-system`: ok. 157 MB.
- `Dollyfile-core`, `-cc`, `-make`, `-ninja`, `-dollyfile`, `-zig`, `-posix`: ok (export-only
  packages of what the toolchains built; posix formats upstream's pages with mandoc's text-page).
- `Dollyfile-git`: 1 (-O0 and seven flags that deny functions musl has), 2 (git-remote-https
  linked a second time instead of a link). `-DNO_REGEX` stays: the sysroot's regex.h has no
  REG_STARTEND, which Git requires.
- `Dollyfile-session-recover`: 5 (FROM system-tools, needs only cc).
- `Dollyfile-mandoc`, `-less`: ok; config.h/HAVE lists say what configure would find.
- `Dollyfile-ghostty-build`: 16 (uucode modules at -ODebug without a reason).
- `Dollyfile-zig-build`: ok.
- `Dollyfile-display`: ok (8 COPY rows, termcap).
- `Dollyfile-amy`, `-curl`, `-gzip`, `-nena`, `-transfer`, `-html`, `-ps`, `-stack-wrap`,
  `-zlib`, `-dolly-docs`: ok.
- `Dollyfile-libdolly-{audio,gpu,microphone,sockets,touch}`: ok; five near-identical recipes,
  moot as duplication: separate packages are what lets an image declare one module (14).

demos/tools:

- `tools-build`: ok (cmake-build + mandoc; 241 MB build-only).
- `base64`, `bc`, `bzip2`, `flex`, `jq`, `lz4`, `meson`, `pigz`, `sbase`, `sqlite`, `tar`,
  `tree`, `unzip`, `wabt`, `xxd`, `xz`, `yacc`, `zip`, `zstd`, `binaryen`: ok. Each
  workaround's reason re-checked: no fork (flex, tar's spawn patch, vi), no REG_STARTEND, sbase's
  od, no message catalogues, one thread. Every one has a licence file and a check.
- `dte`: ok; its one changed line (tcgetpgrp -> isatty) is still needed, the libc adapter has
  no tcgetpgrp (17, proposal).
- `toybox`: ok; three lines changed for a Linux-only #error, syscall and an exit handler.
- `vi`: 6 (the Enter-to-newline read wrapper stands in for an ICRNL the kernel's initial mode
  lacks; proposal P1, recipe unchanged).

demos/rust:

- `rust-sdk`, `rust-llvm`, `rust-build`: ok; comments true (incremental sessions, 4 jobs).
  rust-build 503 MB, rust-llvm 423 MB, build-only.
- `rust`, `cargo`: ok (COPY out of rust-build; 321 MB and 35 MB).
- `rust-tools`: ok (sockets client for crates that link it, 847697672).
- `vendor-crates`: 8 (installs sbase it does not use), 9.
- `cbindgen`, `fd`, `naga`, `protox`, `ripgrep`: 10 (declare http@0; their executables record
  threads@0 only), ripgrep 9.

demos/llvm:

- `llvm-tablegen`, `llvm-build`, `llvm-cc`, `llvm`, `llvm21-tablegen`, `llvm21`: ok. The chain
  is build-only but for the two packages; llvm-build 903 MB keeps both the seed's archives and
  LLVM's install tree, as its comment says.
- `llvm-runtimes`: ok; nothing installs it, demos/llvm/test/llvm-browser.mjs links it.

demos/local-llm:

- `llama-cpp`, `llama`, `pi-local`: ok. llama-cpp replaces upstream's CMakeLists.txt (its
  README says so).
- `lfm2.5`, `minicpm5-2b`, `qwen3.5-2b`, `qwen3.5-4b`: 13 (no REQUIRES TOOL lines; only the
  4 GB one removes its parts before the capture). 1.3-2.0 GB each, by design.

demos/go:

- `go-sdk`, `go-build`, `go`, `go-tools`: ok; go's http@0 is recorded by its binary.
- `esbuild`: 12 (declares http@0 and says its binary records it; the binary has no stamp and
  the page says it serves nothing).

demos/pi:

- `pi`, `pi-dolly`, `pi-agent`, `pi-minimal`: ok (pi's host list is asserted by
  demos/pi/test/recipes.test.mjs; pi-minimal is opened by test/npm-browser.mjs).
- `pi-runtime`: 7 (INSTALL janis is a row pi-dolly's chain installs anyway).

demos/javascript: `quickjs`, `janis`, `janis-install`, `typescript`: ok but 9.

demos/lean: `lean-stage0`, `lean-std`, `lean-meta`, `lean`: read as text; the integrator holds
the lean-std crash. The three stage-1 recipes repeat the same two-archive extraction; the
packages declare runtime@0 alone since they hold only data and archives, lean declares stack@0
and threads@0 for its programs. lean 9.

demos/python: `libffi`: ok (FROM system where system-build would do, as python). `python`:
ok; the -O0 outliers comment ("the optimizer spends minutes") is not re-measured (18); the
socket stubs make name resolution fail explicitly, as the porting rules ask.

demos/zig: `zig-llvm-build`: ok. `zig-llvm`: 11 (declares http@0; zig records nothing), 9.

demos/codex: `codex`, `codex-agent`: ok (codex records sockets, http, threads).

demos/closed-source-agent: `closed-source-agent`, `secretenv`: ok.

demos/ocaml: `ocaml`: ok. demos/studio: `dollyfile-studio`: ok (1.6 GB: pi-local's model).

## Findings

1. Git is compiled at -O0 "for deterministic browser cold-build latency" and with
   `-DNO_PREAD -DNO_SETENV -DNO_STRCASESTR -DNO_STRTOUMAX -DNO_MEMMEM -DNO_MBSUPPORT -DGAWK
   -Dprintf=iprintf -Dfprintf=fiprintf`, flags of the first prototype (0d224977c): musl declares
   all of those functions, GAWK is a Makefile variable, and iprintf is an Emscripten size trick.
   Measured: see `measure-builds.log` (git section).
2. `git-remote-https` is compiled and linked a second time from the same sources as
   `git-remote-http`; upstream installs it as a link.
3. GNU Make is compiled from `src/runtimes/make-amalgamation-dolly.c`, seven units that
   #include its 34 sources, with seven 13-line SLOP steps. Measured in `system`: one `cc` of the
   34 sources at -O1 takes 4.1 s against 3.6 s for the seven parts and gives a 363 KB make
   instead of 387 KB; both run. The amalgamation and its staging line are not needed.
4. Samurai is compiled from `src/runtimes/samurai-unit-dolly.c`, 13 units, with `util.c` at
   -O0 for "a severe bootstrap-compiler blowup". Measured: `util.c` compiles in 0.85 s at -O1
   (0.09 s at -O0, 0.19 s at -O2); one `cc` of the 13 sources at -O1 takes 1.5 s against 1.3 s
   for the 13-part make and gives a working ninja of 145.6 KB (146.7 KB).
5. `session-recover` is FROM system-tools and needs only cc: system-build, as amy, curl, nena,
   transfer and gzip are.
6. `vi` wraps `read` to turn Enter's CR into LF because "Dolly's terminal maps no input". The
   kernel maps CR to LF under ICRNL since e4c637b8b, but the wrapper is not moot: measured
   (`vi-enter-2.log`), a vi built without it gets `one^Mtwo^Mthree` on one line and `:wq`
   never runs, because the kernel's initial mode (`src/dolly.c:21`, CANONICAL ECHO OPOST ONLCR
   ISIG) has no ICRNL where every Unix terminal starts with it, and Neatvi, like most programs,
   keeps c_iflag as tcgetattr gives it. The recipe is unchanged; the cause is a proposal (P1).
7. `pi-runtime` installs janis before pi-dolly, whose pi installs janis-install, which installs
   janis: the row is installed by the chain whether written or not.
8. `vendor-crates` installs the sbase package; its script runs sha256sum (posix), gzip and cargo
   only (demos/rust/vendor-crates.mjs). janis-install, whose pattern it copied, needs sbase's
   sha512sum.
9. `SLOP mkdir -p /usr/share/man/cat1` in quickjs, janis, janis-install, vendor-crates, ripgrep,
   lean and zig-llvm: every image built FROM system-build or its descendants holds that
   directory (system-build's `FOLDER /usr/share/man`, written after cat1 and man1 exist).
10. cbindgen, fd, naga, protox and ripgrep declare `http@0`; their executables record
    `threads@0` only (`host-stamps.mjs`), and Rust's linker adapter links no HTTP client.
11. zig-llvm declares `http@0` and `threads@0`; /usr/bin/zig records neither. threads@0 follows
    the rule for a compiler (what every program it builds may need, as rust declares); nothing
    explains http@0 (6e5680052 does not mention it).
12. esbuild declares `http@0` "which records http@0"; the binary has no dolly.host section (go's
    does), and its page says it serves nothing.
13. The four model packages declare no `REQUIRES TOOL` (cat, sha256sum, cut, test, mkdir) and
    only qwen3.5-4b removes its parts before the capture, "so the build fits 9 GB".
14. Moot: libdolly-* are five copies of one 24-line recipe. A package per module is what lets an
    image declare only the module it uses; a generator for five trivial recipes would be more
    lines than it saves.
15. system-build's comments: "The module owns Make's build-time command vocabulary ... The
    Dollyfile checker documents this build contract" (the .dm module days) and system-tools's
    "Focused compatibility commands used by build systems and coding agents. Each remains a
    separate Wasm executable; wrappers which launch another tool do so through Dolly's
    in-userspace spawn/wait contract" say nothing a reader of the recipe needs.
16. Uncertain: ghostty-build compiles the uucode modules of libghostty-vt at -ODebug and the
    rest at -OReleaseSmall, since the prototype (c4dbe3ad0), with no reason recorded. Upstream
    builds uucode at the project's optimize mode. Not changed: the display package depends on
    it, a rebuild is 10+ minutes, and the only test would be that the tables still compile and
    the terminal still draws.
17. Uncertain: dte's one changed line exists because the libc adapter has no tcgetpgrp. A
    process-contract question for the owner: should the adapter answer tcgetpgrp for the
    terminal descriptor with the foreground process's id?
18. Uncertain: python compiles tracemalloc.c and arraymodule.c at -O0 because "the embedded
    LLVM optimizer spends minutes" on them, measured on the first seed. Re-measuring takes a
    CPython source tree in a session; not done tonight.

## Fixes

- 495ae47dc, findings 7-13: the dead `http@0` lines of cbindgen, fd, naga, protox, ripgrep,
  zig-llvm and esbuild; pi-runtime's janis row and vendor-crates' sbase row; six `mkdir -p
  /usr/share/man/cat1`; the model packages' `REQUIRES TOOL` rows and the removal of their parts
  before the capture. Rebuilt (`build-a.log`, sealing passed): quickjs janis janis-install
  ripgrep closed-source-agent esbuild fd go-tools pi pi-dolly pi-runtime pi-agent pi-minimal
  typescript vendor-crates. Tests: `tests-{js,pi,go}.log` (results below). Not rebuilt here:
  naga, protox, cbindgen, zig-llvm, the four models, and the dependents codex, codex-agent,
  pi-local, dollyfile-studio, bhop, classicube, rts-arena, slopyard, pi-phone, spidermonkey,
  zero-ad*, xonotic*, ghostty-gtk, ghostty-x11: the next catalog round.

## Proposals

- P1. The kernel's initial terminal mode has no ICRNL (`src/dolly.c:21`), where POSIX terminals
  start with it (`stty sane`). A program that leaves c_iflag alone, as Neatvi does, reads Enter
  as CR in raw mode; the vi package carries a read wrapper for it, and any ported editor that
  trusts the Unix default would need the same. Smallest diff: add `DOLLY_TERMINAL_ICRNL` to the
  initial `terminal_mode_flags` (kernel C, not an image input); the line editor already ends a
  line at either character, and a program that wants CR clears the flag. Then vi's wrapper
  goes. Evidence: finding 6, `vi-enter-2.log`.
- P2. The language keeps build-only tools in an image that used them: rust-build's 370 MB
  toolchain stays in every image built FROM it (ripgrep's own package is 5.9 MB because it is a
  PACKAGE; rust-tools, FROM system with rust and cargo installed, is 513 MB by design). The
  known language question; the measurements here are the snapshot sizes in
  `snapshot-sizes.txt`.
- P3. `tcgetpgrp` is absent from the libc adapter, so dte's one changed line (finding 17) stays.
  A process-contract question: answering it for the terminal descriptor with the foreground
  process's id would let dte build unchanged.

## Lessons

- A `REQUIRES HOST` line is checkable: the `dolly.host` section of the retained executable says
  what the program records (`host-stamps.mjs`). Seven packages declared a module nothing in them
  records, and three READMEs or comments said the binary "records" it. Read the stamp before
  believing the comment, and give the lint that check: a package whose executables record a
  strict subset of its declarations (modules a compiler passes on excepted) is a finding it can
  print.
- A workaround's reason can be true and still not be the cause. vi's Enter wrapper says "the
  terminal maps no input"; the kernel has mapped CR under ICRNL for weeks, yet the wrapper is
  needed, because the initial mode lacks the flag every Unix starts with. The fix is one kernel
  line (P1), not a recipe. Measure the workaround's removal (the typed test) before deleting it.
- The bootstrap compiler's limits of October are gone: Samurai's `util.c` compiles in 0.85 s at
  -O1 and Git in 89 s at -O2, so the unit files, the 7- and 13-part builds and Git's -O0 were
  rot. Re-measure every "the compiler cannot" comment after a seed change; a 180 s session of
  `system` with the staged archives as fixtures answered three of them.
- A plain `npm run image` in a tree builds every image its catalog lacks, Lean's 2 GB chain
  included; name the images (`DOLLY_BUILD_IMAGES`) even to restore a catalog. And never wait on a
  monitor without a deadline you check yourself: two of tonight's hours went to that.
