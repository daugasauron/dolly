# Audit: Slop, the seed commands and the Dollyfile language

- STATUS: OPEN
- PRIORITY: 300
- TAGS: core,audit,slop,dollyfile

The 2026-11-01 night audit of the minimal userspace and the image language (agent C, branch
`core/audit-slop` from `main` `577aafb1`): `src/slop.c` and `docs/slop.md`, `src/commands/`,
the Dollyfile language (`docs/dollyfile.md`) and its two implementations (`src/dollyfile.c`,
`src/dollyfile-view.mjs` with `src/dollyfile-graph.mjs`), the linters and pin scripts.
Measure: Unix philosophy, POSIX where claimed, explicit failure otherwise.

## State (2026-11-01 17:45)

Two rounds of seed fixes are committed with every recipe repinned; the second build (both
rounds, `default` and `system` and their closure, 22 images) runs in this tree as unit
`dolly-audit-slop-seed2` (log `build/audit-slop-evidence/image-seed2.log`). The first build
was stopped after six images to batch round 2 into one chain rebuild. Browser verification
(Chromium, Firefox: core, slop, shell, amy-free tests) follows the build.

## Method

Native Slop (`src/slop.c` with `test/fixtures/native-spawn.c`, ASan and UBSan) against dash
(POSIX) and Bash on probe batteries (`build/audit-slop-evidence/probe/`), then the cases that
differ were read in the source.

## Findings fixed

1. **A command substitution ended at the first unbalanced `)`**: `$(...)` was found by
   counting parentheses with quotes, so a here-document, a comment or a case pattern inside it
   ended it early. The agents' commit-message form fails on any apostrophe or parenthesis in
   the message (`git commit -m "$(cat <<'EOF' … didn't … EOF )"`: "unterminated command
   substitution"), as do `$(case $x in a) …;; esac)` and a comment with `)` or `'`. The same
   counter was written twice (`defer_dollar`, `expand_dollar_now`). Now one scanner,
   `substitution_end`, reads the text as the shell reads a command: quotes, escapes, comments,
   nested substitutions, here-document bodies and case patterns; `arithmetic_end` serves both
   `$((`. Case "a substitution holds a here-document, a comment and a case pattern" fails on
   main (status 2) and passes.
2. **`"$@"` inside a parameter word was one field, except for one spelling**: the lexer matched
   the exact text `${1+"$@"}` (`deferred_guarded_positional_fields`); `${1:+"$@"}`,
   `${x-"$@"}` and `"${1+$@}"` joined the parameters into one field, silently. The rule is now
   general: a quoted `$@` in a parameter word gives one field per parameter, empty ones kept,
   with the same `'f'` boundaries a quoted `$@` inside a word already used; the special case is
   gone. The corpus (`.cache` sources) spells it only `${1+"$@"}` (344 times), which still
   passes; case "a quoted $@ in a parameter word is one field per parameter" fails on main
   (status 91) and passes.
3. **Tab completion ignored `~`** (task `20261030-212535`): `collect_completions` opened the
   directory `~/.pi` literally. Reproduced in Chromium on main's `pi-minimal`: Pi's editor
   completes `ls ~/.pi/a` to `~/.pi/agent/`; Slop completes `ls /home/dolly/.pi/a` but not
   `ls ~/.pi/a` or `ls ~/.p`. The dot directory is not the cause (hidden entries are offered
   once the typed name starts with `.`, as in Bash). A leading `~/` now completes under `HOME`
   and keeps `~/` on the line.
4. **Bash's `((...))`, `<<<` and `<(...)` were read as POSIX**: `(( x > 3 ))` ran a subshell
   that wrote a file named `3`; `read a <<< w` said "here-document body must begin on the next
   line"; `cat <(:)` "redirection requires a path". POSIX leaves `((` at a command's start
   unspecified, so all three are refused by name before anything runs (cases "Bash's ((...)) is
   refused…", "Bash's <<< and <(...)…"). Agents type all three.
5. **`test` and `[` misread operands that look like operators**: the evaluator split on `-o`
   and `-a` first, so `[ "$1" = -o ]`, `[ -n "$x" ]` with `x=-a` and `test ! = x` failed with 2
   (option loops end there). It now decides by the number of arguments up to four, as POSIX
   says, and reads longer expressions with a recursive-descent grammar; the POSIX primaries it
   lacked (`-b -c -p -S -t -g -u -k`, `<`, `>`) are added. Measured against dash and Bash on 60
   cases: the remaining differences are POSIX's unspecified ones and the deliberate `-w`.
6. **`cat` did not stream**: it read with `fread`, which fills 4 KiB before returning, so
   `(echo a; sleep 2; echo b) | cat` showed `a` after two seconds (measured natively); agents
   pipe through `cat` to avoid pagers. It now writes what each `read` returns; `-u`, POSIX's
   one option, was refused and is accepted.
7. **`cp` copied a link operand as a link**: POSIX copies the file it names without `-R`, so
   `cp /bin/sh x` made a dangling link. `-p` (72 uses in the cached upstream build scripts,
   `cp -pR` 96 more), `-H`, `-L`, `-P` are added.
8. **`echo --help` printed a usage**: POSIX echo has no options but `-n`; its page is a `FILE`
   in `Dollyfile-system-build` as `test`'s is.
9. **1024-byte path buffers** in `pwd`, `mkdir -p`, `rm -r` and three places in Slop, below the
   4096 bytes paths may have; `rm` now allocates per entry.
10. **`find` lacked POSIX's `-newer`, `-atime`/`-ctime`/`-mtime`, `-size` and the
    `-type` letters `p s b c`**; **`xargs` lacked `-L`, `-E` and `-x`**; **`touch` lacked `-a`,
    `-m`, `-r` and `-d`** (`touch -r` is in six cached upstream scripts). Each fails explicitly
    today; each is added with a native case in `test/commands.test.mjs`.
11. **Slop's `cd` refused `-P`**: `sdl2-config` (in the corpus) finds its prefix with
    `cd -P -- "$(dirname -- "$0")"`, which failed with "expected at most one directory". Slop's
    `PWD` is always the real path, so `-P` (and `-e`) is what `cd` does; `-L` is refused by name.
12. **The line editor edited bytes, not characters**: Backspace after `é` left half of it, and
    the arrows moved one column per byte. It now steps over whole UTF-8 characters and moves the
    cursor by their `wcwidth` columns (two for `日`); `test/shell-browser.mjs` types `x=aé日`,
    Left, Backspace, `b` and expects `ab日`.
13. **`stat` read an unknown option as a file** (`stat -L f`: "-L: No such file"): options are
    parsed, `-L` follows the link, others fail with 2. **`ls -p` marked links with `@`**: `-p`
    marks directories only; `-F` also links, FIFOs (`|`) and sockets (`=`).

## The Dollyfile language: what is measured, and proposals for the owner

Counted over the 186 catalog recipes (`git ls-files` of every `Dollyfile*`):
`SLOP` 1,127 rows, `RUN` 5 (the root recipe, before Slop exists: both are needed, as the
owner said), `FILE` 645, `SOURCE` 448, `INSTALL` 193, `FROM` 174, `FOLDER` 110, `COPY` 66,
`USE` 64, `ENTRY` 50; `REQUIRES TOOL` 1,013, `HOST` 699, `HEADER` 199, `LIB` 100,
`FOLDER` 1, `FILE` 0, `ENV` 0; `EXPORTS TOOL` 369, `LIB` 101, `HEADER` 101, `FOLDER` 86,
`ENV` 29, `FILE` 24. The implementation of the language as documented showed no defect: the
C engine and the JavaScript parser agree on every case of `test/fixtures/dollyfile-syntax.mjs`
and on the catalog. What follows are changes to the language itself, the owner's call.

- **P1. Drop `EXPORTS ENV NAME APPEND VALUE`.** Two uses, both `PATH` in a toolchain
  (`demos/rust/Dollyfile-rust-sdk:44`, `demos/go/Dollyfile-go-sdk:16`), against the
  catalog's rule that installing composes no `PATH`. The keyword takes an operand position
  a value could have (`EXPORTS ENV X "APPEND literal"` must be quoted, and is a parser test).
  Smallest diff: `apply_environment`'s append branch and its argument in `src/dollyfile.c`,
  the `APPEND` arm in `src/dollyfile-view.mjs`, two sentences of `docs/dollyfile.md`, one
  parser case, and the two recipes write `EXPORTS ENV PATH /bin:/usr/bin:/opt/rust-sdk/bin`
  (the base's `PATH` is `system-build`'s `/bin:/usr/bin`). Images of the two SDK chains
  rebuild, and every image, since the engine is in the seed.
- **P2. Drop `REQUIRES FILE`, `REQUIRES ENV` and `REQUIRES FOLDER`.** Never written but once
  (`Dollyfile-system-build:412` asserts the recipe's own `EXPORTS FOLDER process-sdk`, which
  sealing checks anyway); `REQUIRES FILE` appears in one browser test. `REQUIRES` keeps the
  three kinds recipes use: `TOOL`, `LIB`, `HEADER` (and `HOST`). The exports stay: they retain
  and name objects.
- **P3 (larger, uncertain). One parser.** The language has two implementations kept equal by
  545 lines of parity tests (`test/dollyfile-parser.test.mjs`, `test/fixtures/dollyfile-*.{mjs,c}`):
  the engine (`src/dollyfile.c`, about 350 lines of parsing and validation interleaved with
  execution in `process_line`) and `src/dollyfile-view.mjs` (312 lines), which the page, the
  build service, Studio (`demos/studio/lint.mjs` is a command over it, not a third parser) and
  every script use. The page validates before the engine runs, so the engine's own late
  validation never fails in practice. Making the engine parse a whole recipe before executing
  it and building that parser into a small Wasm module the page and scripts call would remove
  the JavaScript parser and the parity tests, but adds a build artifact to the page and moves
  work into agent A's area; not prototyped.
- **Observation, not a proposal.** `REQUIRES HOST` is a manifest declaration that must follow
  the role line; `REQUIRES TOOL`/`LIB`/`HEADER` are build-time assertions anywhere. One keyword
  carries two meanings with different placement rules.

## Lessons

- A plain `npm run image` stages `src/` while it runs: editing `src/slop.c` during its source
  preparation pinned a half-edited Slop into every recipe and started a 183-image rebuild,
  stopped after six images. Never edit seed inputs while a build in the same tree prepares.
