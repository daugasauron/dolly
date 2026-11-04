# Slop and the Dollyfile language: one parser, the utilities in the shell, and what nothing uses

- STATUS: OPEN
- PRIORITY: 230
- TAGS: core,slop,dollyfile,cleanup

Six items of `tasks/20261101-074424-audit-slop`, decided 2026-11-04
(`tasks/20261102-133353-owner-decisions`). Every one changes Slop or the engine, which are in
the seed, so they go in one branch and one catalog round.

1. **Slop runs `test`, `[`, `echo`, `printf`, `true` and `false` itself.** FFmpeg's configure
   starts 75,504 processes under Slop and 7,555 with five of them in the shell (5,289 of the
   rest are `printf`); a process costs 5 to 12 ms, so 6 to 14 minutes of one configure; measured
   65 s with them against 344 to 439 s without. Every POSIX shell does this. `proposal/slop-utilities`
   (da548b9d on 68bbd7d9) includes `src/commands/test.c` and `echo.c` in Slop so the builtin and
   `/bin/test` are one source, and a name found earlier on PATH, a slash or a background stage
   still runs the program. Yes, with `printf` added the same way; `docs/slop.md`'s "each tool is a
   separate executable" changes.
2. **One Dollyfile parser, the page's.** Two parsers kept equal by parity tests (`src/dollyfile.c`,
   `src/dollyfile-view.mjs`). The engine's checks run in userspace assumed compromised and protect
   nothing; the page's has every other user and needs no build step. `proposal/dollyfile-one-parser`
   (e934ca17 on dd5b0fa8): the page compiles a recipe into rows (`/etc/dolly/recipe.rows`,
   `DOLLY 7`), the engine checks their digest against the recipe text and executes; a live install
   reads the image's receipt. 372 lines out, 256 in. Verified: 22 images built from rows; image,
   Slop, shell, core, process and amy suites in Chromium and Firefox. Yes.
3. **`EXPORTS ENV NAME APPEND VALUE` goes** (`proposal/dollyfile-no-append` 607fcc3a): two uses,
   both PATH in a toolchain against the catalog's rule that installing composes no PATH, and the
   keyword takes an operand position (`EXPORTS ENV X APPEND` sets X to APPEND). Yes.
4. **`REQUIRES` keeps TOOL, LIB, HEADER and HOST** (`proposal/dollyfile-requires` 8573582e): FILE
   and ENV are never written in 186 recipes, FOLDER once, asserting its own export. Yes.
5. **`/bin/cd` goes** (`src/commands/cd.c`, `Dollyfile-core:15,32`): a program cannot change its
   caller's directory; POSIX.1-2024 makes `cd` optional as an executable; Make sends `cd` lines to
   the shell. `/bin/command` stays. Yes.
6. **Slop stops choosing a directory.** `interactive()` (`src/slop.c:5693-5697`) makes
   `/workspace` (the kernel already does, `src/dolly.c:283`), changes into it and sets PWD, so
   `slop` typed in `/tmp` lands in `/workspace`, undocumented since the first prototype. A shell
   starts where it is launched. The session's first process starts in `/workspace` because the
   boot says so: the language already names `/workspace` the never-retained scratch
   (`docs/dollyfile.md:117`), so the convention is the system's, not the shell's, and the 28 images
   whose ENTRY is a bare `/bin/foreground -i /bin/slop` keep their visible start. Measure first
   where the root spawn's directory is set today (the supervisor's root spawn) and move the
   convention there; then the lines leave `interactive()`. Yes, so.

Done when: all six are on integrate in one round; `test/slop-browser.mjs`, shell, core, process,
image and amy suites pass in Chromium and Firefox; 200 iterations of `[`, `test`, `echo` and
`printf` measured against the 2.4 to 2.8 s before; FFmpeg's configure timed in the `ffmpeg`
build; `default` opens in `/workspace` and `cd /tmp && slop` stays in `/tmp`; `/bin/cd` is gone
from every image; `docs/dollyfile.md` and `docs/slop.md` describe the language and the shell as
they are.

## Work (2026-11-04, branch `core/slop-language` in `work/slop`)

Item numbers are this task's. Evidence in `work/slop/build/slop-evidence/`.

- **1, the utilities in the shell** (`5fb057d2`): the proposal's commit, with `printf` added
  the same way. `/bin/printf` was sbase's, whose code exits on errors and edits its operands,
  so it cannot run inside the shell; the builtin and the program share a source only if the
  program is Dolly's: `src/commands/printf.c` (POSIX's printf, 230 lines), compiled for
  `/bin/printf` in `system-build` beside `echo` and exported by `core`; sbase's leaves
  `system-tools` and `posix`. `test/commands.test.mjs` compares its output and status with the
  host's coreutils printf on 17 cases (flags, widths, `*`, `%b` and `\c`, octal and hex escapes,
  character constants, conversion errors, reuse of the format, `--`): equal.
- **3, no APPEND** (`73486c95`): the proposal's commit; the in-Dolly engine case
  `environment` now proves that a repeated export replaces; Studio's Vim syntax loses the word.
- **4, REQUIRES** (`11d0cfe4`): the proposal's commit; Studio's Vim syntax highlights FILE and
  FOLDER after EXPORTS only.
- **5, `/bin/cd`** (`76720e7e`): gone from `system-build`, `core`, the man page loop, the native
  `--help` test and `docs/slop.md`. No recipe, test or demo ran it (`xargs cd`, `env cd`,
  `find -exec cd`, `command -v cd` searched).
- **6, the directory** (`c2ac96db`). Measured in the source: the supervisor's root spawn (`encodeSpawn`,
  `src/process-supervisor.mjs`) sends no directory (`cwd_size` 0), so `spawn_packet` gives a
  root process the kernel's own directory, `/`, which nothing changes, and the kernel's boot
  environment has `PWD=/` (`initialize_boot_environment`); `interactive()` then moved the
  shell to `/workspace`. The convention moves to the kernel's image boot,
  `dolly_bootstrap_environment()` (`src/dolly.c`), which only an image's boot calls (a build
  closes before it), after the session's files are replayed: `chdir("/workspace")` and
  `PWD=/workspace`, inherited by ENTRY. Kernel C, not a seed input; the five lines leave
  `interactive()`. Startup scripts that say `cd /workspace` (`pi-minimal`, `pi-agent`,
  `pi-phone`, `closed-source-agent`, `scripts/dolly-build-init`) now restate the boot.
- **2, one parser** (`da086a4c`): the proposal's commit, merged by hand onto today's engine
  (three conflicts: the last-use flag, REQUIRES and EXPORTS, which items 3 and 4 had changed);
  2,313 lines of `src/dollyfile.c` to 2,123. The engine guards the field counts it indexes
  (EXPORTS read `words[0]` before counting them in the proposal). `scripts/image-inventory.c`
  allows `/etc/dolly/recipe.rows` in a build beside `recipe.locator`. Why each piece of the
  engine's parser existed: The tokenizer
  (`strip_comment`, `next_word`, `split_words`, `trim`), the line assembly in `execute_recipe`
  and the syntax and order checks of `process_line` date from the first engine (`9e013dd9`,
  2026-08-31), when it was the recipe's only reader. The page's parser came for views, host
  requirements and the graph, and since `76a941ad` (2026-09-30) a shared corpus
  (`test/fixtures/dollyfile-syntax.mjs`) kept the two equal. Every engine run is started by the
  page's build worker, which has parsed the recipe first; the only other reader was
  `install_live`'s parse-only pass over the image's own recipe, for its host modules and
  environment, which the image's receipt and environment file already hold. The checks run in
  userspace AGENTS.md assumes compromised. Since the proposal's base the engine gained the
  last use of an artifact moving its files out of the snapshot (`695329cb`, `749d57c9`), which
  read the recipe text after the line (`rest`); it now reads the rows after the row.
- **Round 1** (items 1, 3, 4, 5; seed `8124fd44…`): `default` and `system`, 23 images, 1,418 s
  in one build slot (zig-build 14 min). Slop and shell suites passed in Chromium and Firefox.
  A build of `ffmpeg` started as `( … ) &` inside a tool call waited silently for a build slot,
  started four minutes later, staged the item-6 Slop edit made meanwhile and rewrote the
  catalog under the running core suite (Firefox failed: "snapshot metadata does not match");
  stopped by PID, the recipes and Slop restored, the 23 images restored from the cache (107 s,
  system-build rebuilt to the same digest), the remaining suites run again.
- **Round 1 verified** (`5fb057d2`..`76720e7e` on images of seed `8124fd44…`): in Chromium and
  Firefox, `slop-browser`, `shell-browser`, `core-browser`, `process-browser`,
  `image-browser`, `man-browser` and `amy-browser` without the tests that install packages a
  narrowed build does not publish (the `amy` test installs `make` where it installs `python`;
  `amy refusal` and `USE` whole) pass. 200 iterations in `system`, by the page's clock around
  one submitted loop: `[`, `test`, `echo` and `printf` in the shell 0.115 to 0.135 s in Chromium
  and 0.16 s in Firefox; the same four as programs by path (`/bin/[` …), in the same session,
  4.9 to 5.1 s and 8.6 to 9.6 s (6 and 11 ms a process). 200 `[` alone 0.063 to 0.068 s and
  0.085 to 0.098 s; 200 `printf` 0.070 s and 0.075 to 0.082 s.
- **Round 2** (all six items, `da086a4c`, seed `4df9e404…`): `default`, `system` and `ffmpeg`,
  24 images, 1,491 s; every image built from the page's rows, the root build's engine
  included. **FFmpeg's configure in the `ffmpeg` build: 30.6 s**, against 225.2 s in
  `work/integrate`'s round of the night (same recipe, same options, the utilities as
  programs) and 65 s on 2026-11-01 with five of them in the shell; its 668 lines of output are
  identical to that round's (`build/slop-evidence/ffmpeg-configure-{before,after}.txt`).
  `make -j4` 162 s here beside another agent's builds (92 s there).
- **Round 2 verified** in Chromium and Firefox: `slop-browser`, `shell-browser`, `core-browser`,
  `process-browser`, `image-browser` (the in-Dolly engine cases now read the rows the page
  compiles), `man-browser` and the narrowed `amy-browser` (`amy`, `amy refusal`, `USE`, the
  last with an engine built from this checkout and its rows) pass. `process-browser`'s new
  check (`default` opens in `/workspace`; `cd /tmp && slop` stays in `/tmp`) first timed out
  waiting for a new foreground PID: a shell typed at the prompt is not an interactive
  foreground program as `foreground -i` makes one; the nested shell already showed
  `dolly:/tmp$`. It now waits for that prompt (`0b7c0696`); with round 1's Slop it fails, the
  nested prompt being `dolly:/workspace$`. In `system`, `/bin/cd` is absent, `type cd` names
  the builtin and `printf`'s page is installed. 200 iterations, a quieter machine than round
  1: the four in the shell 0.076 to 0.081 s (Chromium) and 0.095 s (Firefox); as programs
  2.65 to 2.75 s and 4.34 to 4.35 s, the 2.4 to 2.8 s the task names for three of them.
- **FFmpeg's configure twice in one `system` session** (Chromium,
  `build/slop-evidence/ffmpeg-configure-browser.mjs`; the recipe's options without zlib,
  which `system` lacks): **19.1 s** with `PATH` as it is, **331.2 s** with copies of `test`,
  `[`, `echo`, `printf`, `true` and `false` earlier on `PATH`, which Slop starts as processes.
  Both ran to the end of configure.

- **More suites on round 2's images**, Chromium and Firefox: `custom-session-browser`,
  `pty-browser`, `threads-browser`, `sockets-browser`, `terminal-browser`,
  `embedding-browser`, `upload-browser` (custom images built in the tab from the page's rows)
  and `nena-browser` (live installs, which now read the image's receipt) pass; `nena` and
  `sockets` once the three `libdolly-*` packages they install were built (18 s).

## State (2026-11-04 10:55)

All six items are on `core/slop-language` and verified on `default`, `system` and `ffmpeg`
built from it. Open until the catalog round: every image's seed changed (`src/slop.c`,
`src/dollyfile.c` in `dolly.data`, `src/commands/`) and so did `system-build`, `system-tools`,
`posix`, `core`, `rust-sdk`, `go-sdk` and `dolly-docs`; the round rebuilds the whole catalog
and runs the suites the narrowed build could not (`default-browser.mjs`, the whole
`amy-browser.mjs`, the demos). The five startup scripts that `cd /workspace` (item 6) now
restate the boot and could lose the line; left as they are.

## Lessons

- A `( … ) &` inside one tool call outlives the call and waits for its slot without a word:
  it started four minutes later, staged a seed edit made in between and rewrote the catalog
  under a running suite. Start every long job as the tool's own background job, and never edit
  a seed input while any build of the tree might still prepare.
- The cheapest honest "before" is the same session: copies of the six programs earlier on
  `PATH` turn the shell's fast path off, so 19 s against 331 s for FFmpeg's configure and 0.08
  against 2.7 s for 200 iterations were measured side by side, with no second build.
- A proposal three days old merges cleanly where nobody touched the code and conflicts exactly
  where later work changed the same rule (the last-use flag; items 3 and 4 in the engine):
  three-way merging in a scratch copy and compiling it with `-Wall -Wextra` there let the merge
  wait for the browser slot without touching the tree.
- `printf` "added the same way" was not a one-line table entry: sbase's exits on an error and
  edits its operands, so it cannot run inside the shell, and "one source" meant Dolly's own
  `printf.c`. Comparing it with the host's coreutils on a case list caught the one difference
  (`%c` of an empty operand writes NUL) before any image was built.
