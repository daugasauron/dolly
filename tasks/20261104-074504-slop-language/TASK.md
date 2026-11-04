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
