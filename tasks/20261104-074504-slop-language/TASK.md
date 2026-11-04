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
