# Audit: Slop, the seed commands and the Dollyfile language

- STATUS: OPEN
- PRIORITY: 300
- TAGS: core,audit,slop,dollyfile

The 2026-11-01 night audit of the minimal userspace and the image language (agent C, branch
`core/audit-slop` from `main` `577aafb1`): `src/slop.c` and `docs/slop.md`, `src/commands/`,
the Dollyfile language (`docs/dollyfile.md`) and its two implementations (`src/dollyfile.c`,
`src/dollyfile-view.mjs` with `src/dollyfile-graph.mjs`), the linters and pin scripts.
Measure: Unix philosophy, POSIX where claimed, explicit failure otherwise.

## State (2026-11-01 22:30)

Every fix below is committed with every recipe repinned, built and verified in Chromium and
Firefox: round 12 (`68bbd7d9`, the 22 images of `default` and `system`, 884 s) passes
`test/slop-browser.mjs` (every Slop case, run in Dolly), `shell-browser.mjs`,
`core-browser.mjs`, `man-browser.mjs`, `process-browser.mjs` and `terminal-browser.mjs`;
round 13 (finding 25: `gzip` compresses, `cc -v`; 873 s) passes the shell, core, man,
process and Slop suites. The source suite passes (462).
Not measured: `default-browser.mjs`, whose checks read the whole catalog's package index and
packages (`python`, `zig`) that a narrowed build neither publishes nor rebuilds, and the
demos. The catalog needs a round: `src/slop.c` and `src/commands/` are root-recipe inputs and
every recipe is repinned. Proposals P1, P2, P3 and P6 are prototyped on branches
`proposal/dollyfile-no-append` (`607fcc3a`), `proposal/dollyfile-requires` (`8573582e`),
`proposal/dollyfile-one-parser` (`e934ca17`) and `proposal/slop-utilities` (one commit on
`68bbd7d9`), not on this branch. Agent F's FFmpeg
build (`demo/ffmpeg`) merged `ad78dbef`, whose utilities this branch took out again: its
65 s configure in Dolly ran with P6; without it the full option set measured here starts
67,949 more processes.

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
14. **Output that could not be written was success**: `ls`, `find`, `du`, `stat`,
    `file`, `pwd` and `man` exited 0 with their output to `/dev/full` (measured on main's `ls`,
    `du`, `pwd`); in Dolly a full kernel memory is `ENOSPC`, so `find / > list` could truncate
    silently. They now flush and fail with 1 and a message (`commands whose output cannot be
    written fail`).
15. **`set -f` was refused**: automake's `install-sh` (nine copies in the cached
    sources) splits a path between `set -f` and `set +f`; under Slop both printed an error
    and globbing stayed on. `set -f`, `set -o noglob`, `slop -f` and `f` in `$-` are added,
    per shell (a subshell's `set -f` does not leak).

16. **`OPTIND` was unset when Slop started**, so the usual option loop in a script given no
    option, `while getopts ab o; do …; done; shift $((OPTIND - 1))`, ran `shift -1` and failed.
    **`IFS` was unset too**, so `old=$IFS; IFS=:; …; IFS=$old` left it empty and turned field
    splitting off for the rest of a script; **`PPID`** was missing. All three are set at start,
    as POSIX says and dash and Bash do (cases "OPTIND is 1…", "IFS is space, tab and newline…").
17. **`command -V` was refused**: POSIX's description of what runs for a name now shares
    `type`'s code (`describe_commands`).
18. **`install` refused combined options**: `-m644` (16 uses
    in the cached upstream Makefiles), `-m755` (10), `-Dm644` (2) and `-cm 644` failed with
    "unsupported option". Letters now combine and a value may be attached or follow; `-D -t
    DIR` creates the directory as GNU install does.
19. **`mkdir -m` was refused** (`mkdir -m 755 -p` in utf8proc's install rule): the
    mode is accepted and not kept, as `install -m` is (the owner's decision of 2026-10-01), and
    letters combine (`-pm 755`). **`rm` gains `-v` and `-d`** (POSIX.1-2024; `rm -rv` in the
    corpus).
20. Small Slop fixes from reading the new scanner and the editor: `$(cat <<< w)`
    said "unterminated command substitution" instead of refusing `<<<` by name; `time` keeps
    the command position, so `$(time case …)` reads its patterns; the history file kept every
    command of every session (it is part of each saved session) while the editor keeps 1,000:
    loading now rewrites it to those 1,000.
21. **`tar` refused every `git archive` of a commit, so every GitHub source
    tarball**: git writes a pax global header (`pax_global_header`), which the extractor
    failed on with "Operation not supported", and the archive of a tree failed as soon as one
    path exceeded ustar's 100 bytes (pax `x` header); GNU tar's `././@LongLink` likewise.
    Measured natively on `git archive HEAD` and `git archive $(git write-tree)` of a repository
    with a 241-byte path, the round trip `docs/slop.md` recommends. Global headers are skipped,
    a pax `path` record or a GNU long name names the next member, and that path passes the same
    checks as any other (`../` is refused, `test/tar.test.mjs`); links stay refused. A stale
    workaround went with it: `mkdir_parents` ignored `mkdir`'s result and re-checked with
    `stat` because an early libc "does not consistently preserve errno"; it now reads the result.
22. **`read` collapsed every run of IFS bytes**: with `IFS=:`, `user::1000` gave
    `b=1000` instead of an empty `b`, and `:x` gave `a=x`; a loop over `/etc/passwd`-style
    records, where empty fields are usual, read the wrong columns. `read` now splits as POSIX
    splits fields (IFS white space, or one other IFS byte with white space around it), and
    the last name keeps the rest, matching dash and Bash on ten forms; case "read gives an empty
    field between two separators…" fails on main (status 91) and passes.
23. **FFmpeg's configure** (`ffmpeg-9.0.2`, the newest release, from ffmpeg.org; run natively
    out of tree with `--disable-asm --disable-doc --cc=cc --disable-autodetect`, every native
    component, and with a small set, `--disable-everything` and five components; `sh` linked
    to the spawning Slop) found four things, also reported by agent F
    (`demo/ffmpeg:tasks/20261101-075355-ffmpeg/TASK.md`, "Blocker"):
    - Slop refused `for opt do` (`configure:4682`): POSIX's `for NAME do` needs no separator;
      only a word list ends with one. Fixed (`ad78dbef`).
    - **The variables lived in `environ`**: every lookup and assignment scanned all of them, and
      every substitution copied and restored the whole environment (quadratic; F measured 100
      `x=$(:)` after 10,000 assignments at 32 s). Subshells now undo only the variables they
      changed (`ad78dbef`), and the variables are in Slop's own hash table (`0cbea7bf`; history:
      `environ` with a list of exported names since `f70583ce`, 2026-09-30); `export` keeps its
      list of names and a child's environment is built from it. With 0, 10,000 and 40,000
      variables, a loop of 20,000 lookups takes 0.70, 0.71 and 0.73 s natively (with `environ`
      and the log, 2.1 s with 10,000; all at `-O2`). Not the cause, measured: unexported
      variables never reached children, on main either (`x=1; env | grep -c ^x=` gives 0;
      `exported_environment` filters).
    - **`return` inside a loop**: `while :; do return 3; done` in a function never ended, and in
      `for` the loop variable ran on to the last value (`opt=libxeveb` instead of `libxeve` in
      configure's log, from `enabled_all`'s `for opt; do enabled $opt || return 1; done`). Both
      on main; the loops now stop (`0cbea7bf`, cases "return leaves while and until loops",
      "…a for loop on the value it returned on").
    - The full configure now takes 22.6 s natively (10.7 s with P6) against Bash's 10.1 s and
      dash's 5.7 s, and writes the same `config.h`, `ffbuild/config.mak`, `config_components.h`
      and output as both. Its `config.log` is dash's but for temporary names, `PATH`, `PPID`,
      `PS1`, `E2` (the status of `(: ${foo?})`: 1 as in Bash, 2 in dash; POSIX says non-zero)
      and `echo "1:\n"` (Slop's echo, like Bash's, prints the backslash). Slop starts 75,504
      processes for it, dash 4,476: `[` (31,484), `test` (29,525) and `echo` (6,942) are
      programs in Dolly and builtins elsewhere (P6).
24. **The commands I had not reached**, chosen by counting their spellings in the cached
    upstream sources (`curl -Lo`, `-fsSL`, `-sL`, `-Ssf`; `gzip -d` 9, `-cdf` 7, `-f` 6, `-dc` 6,
    `-t` 1; `diff -u` 36, `-q` 9, `-s` 7, `--brief` 4; `xargs --no-run-if-empty` 2; `patch -p1`
    only; `install`'s other spellings are apt-get's):
    - `curl` refused a letter cluster that ends with a value option (`curl -fsSLo FILE`, `-Lo`):
      `o D X A u r w m` now take the rest of the word or the next one.
    - `gzip -dc` of data that is no gzip stream printed the data and exited 0 (zlib's
      transparent mode; measured on main's): it is now an error, and `-f` copies it as GNU
      gzip and `tar -z` expect. `gzip -d [-fk] FILE.gz` decompresses in place (`.tgz` to
      `.tar`), `-t` checks, several files go to stdout in turn.
    - `diff -s` reports identical files and `--brief` is `-q`; `xargs --no-run-if-empty` is `-r`.
    - Not changed: the `cc`, `c++`, `ld` and `ar` programs are two-line proxies to
      `dolly_toolchain_proxy` (`src/process/runtime-adapter.c`, agent B's), which retries a
      compiler launch that ends 126 three times (`5221de89`, "survive transient Worker
      allocation"): a workaround for spawns that fail transiently, which a 126 from the
      compiler itself would also trigger; the fix belongs in spawning (queue or `EAGAIN`).
      `amy` is being changed on `demo/lean-2` and was left alone.
25. **Two probes the FFmpeg port read literally** (agent F, worked around with upstream options;
    fixed in `68824453`):
    - **`gzip` did not compress**, and FFmpeg's configure takes any `gzip` on `PATH` for a
      compressor (its Makefile runs `gzip -nc9`). It now compresses with the zlib it links:
      in place (`FILE.gz`, the input's times, `-k` keeps it, an existing output or a `.gz`
      input is refused), to stdout (`-c`, `-` or no file; several files are one member each),
      `-1`…`-9`, `--fast`, `--best` and the long names of each letter. It stores no name or
      time, so `-n` is what it always does and `-N` is refused; compressed data is not
      written to a terminal without `-f`. Chosen by the cached sources: `-d` 12, `GZIP_ENV`
      (`--best`) `-c` 18, `-cdf` 7, `-dc` 6, `-f -9 -c` 4, `-c` 3, `-9` 2, `--best` 2, `-n`,
      `--no-name`, `--stdout`, `--fast` 1 each; `-l` 3, `-v` 2 and `-S` 3 stay refused.
      `test/commands.test.mjs` checks that the host's gzip reads every form and that this one
      reads the host's.
    - **`cc -v` alone said "no input files"** (64), so FFmpeg's `probe_cc` (`cc -v 2>&1 |
      grep -q clang`) found no Clang and would build at `-O0`
      (`tasks/20261101-130245-cc-version-banner`, on `demo/ffmpeg`). The answer belongs to the
      seed's `cc` and `c++` commands, not the compiler: they print Clang's banner for `-v`
      alone (`clang version`, `Target: wasm64-unknown-dolly`, `Thread model: posix`), with
      the version the seed compiler that builds them defines (`__clang_version__`), so no
      compiler round is needed; with inputs `-v` still reaches the compiler.

One failure was seen and attributed, not fixed: `test/terminal-browser.mjs` failed once in
Chromium on round 7's images because a typed `y` reached the shell before the command that
`start("read word …")` submitted (the screen shows `yread word …`, then `es`); the test types
right after an unawaited submit, a race between the input ring's two writers. Three reruns
passed, and round 6's run of the same test passed.

Not fixed, measured: `realpath` without `-e` fails on a missing last component (POSIX.1-2024's
default is uncertain to me); `readonly`, `times` and `hash` are "command not found" (no use in
the corpus); POSIX's `>|` and `<>` and redirections after a function body
(`f() { …; } > log`) fail with a syntax error rather than run (no use found in the corpus).
Regressions, measured natively with the spawning Slop: the configure scripts of
GNU Make (197 checks), bison (523 lines) and libffi (161) print the same log under the branch's
Slop and main's, and stop at `umask` in `config.status` as before; libffi's differs in one line,
`printf "%s\n" "…exec … ${1+\"$@\"}"`, where the branch now prints one line per parameter as
dash and Bash do (finding 2).

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
- **P3. One parser, the page's.** Prototyped on `proposal/dollyfile-one-parser` (`e934ca17`,
  one commit on `dd5b0fa8`). The language had two parsers kept equal by parity tests: the
  engine's (`src/dollyfile.c`, tokenizer, line assembly and syntax checks interleaved with
  execution) and the page's (`src/dollyfile-view.mjs`).
  - *Which side remains, and why: the page's.* It runs outside the sandbox, where host
    requirements, pins and routes are decided (the engine is in-Wasm userspace, assumed
    compromised, so its checks protect nothing); every other user reads it (the page, the
    build service, scripts, Studio's lint inside Dolly); and it needs no build step, where a C
    parser for the page would be a Wasm artifact of `npm run build:runtime` in front of every
    script, `npm run image` included. Measured first: the engine parses only the root recipe of
    a build, which the page always reads first, and the running image's recipe in `dollyfile
    install`, whose receipt (`/etc/dolly/artifact`) already holds what it needed.
  - *How:* `recipeRows` compiles a recipe into NUL-separated fields, `DOLLY 7 SHA256` and per
    line its number, count, directive and words (a FILE's body; RUN's and SLOP's directory
    first; SLOP's command as Slop reads it). The build worker writes them to
    `/etc/dolly/recipe.rows` (fetching a catalog recipe and checking its pin); the engine checks
    the digest against the text it fetches, checks only the field counts it indexes, and
    executes. `dollyfile install` reads the image's own receipt instead of parsing its recipe.
  - *What goes:* in `src/dollyfile.c` 318 lines out and 130 in (2,322 to 2,134): the tokenizer
    (`strip_comment`, `next_word`, `split_words`, `trim`), the line assembly, and every syntax
    and order check `process_line` repeated. The validators stay: artifact receipts use them.
    In the tests, the two parity checks go (C and JavaScript accept the same recipes; decode
    the same words): the cases (`test/fixtures/dollyfile-syntax.mjs`) now test the one parser,
    the engine executes the rows of each accepted one, the word cases have literal
    expectations, and a new test refuses rows of another recipe. Added: 28 lines of
    JavaScript, 11 in the build worker, and rows for the three browser tests that run a
    checkout-built engine by hand (`image-browser.mjs`, `amy-browser.mjs` USE,
    `fixtures/dollyfile-cases.mjs`). Net over `src/`, `test/` and `docs/`: 256 in, 372 out.
  - *What it costs:* a new interface between page and engine (the rows file, versioned by its
    `DOLLY 7` header), and `/bin/dollyfile FILE:recipe` typed by hand needs the page's rows.
  - *Verified:* the source suite (463) and the native harness. Not yet in a browser: the engine
    is in the seed (`dolly.data`), so it needs `npm run build:runtime` and a round of images,
    run after the 00:30 merge.
- **P4. Remove `/bin/cd`.** It cannot do what `cd` means (a program cannot change its
  caller's directory); `xargs cd`, `env cd` and `find -exec cd` only test that a directory
  exists. POSIX.1-2024, Slop's target, made `cd`, `command` and the other intrinsic utilities
  optional as executables, and Make sends `cd` lines to the shell. It is in `core` and every
  image, so it is the owner's call; `/bin/command` stays (it `exec`s the program it names).
- **P5. The interactive shell should not choose its directory.** `interactive()` creates
  `/workspace`, changes into it and sets `PWD` whatever directory Slop started in (since the
  first prototype, `0d224977`, undocumented), so `slop` typed in `/tmp` lands in `/workspace`.
  Where an image wants its shell there, its start-up script says `cd /workspace` (as
  `pi-minimal`'s does); images whose ENTRY is `/bin/foreground -i /bin/slop` would then start
  in `/` unless their ENTRY or a start-up script changes directory. The visible start of
  every image changes, so it is the owner's call.
- **P6. Run the system's `test`, `[`, `echo`, `printf`, `true` and `false` in the shell.**
  No owner decision about builtins exists (`tasks/20261006-121403-configure-survey` measured
  the cost and handed it to `tasks/20261006-120641-umask`, which did not decide; `docs/slop.md`
  says "Each tool is a separate executable"), so it is the owner's call and not on this branch.
  Measured: FFmpeg's full configure starts 75,504 processes under Slop and 7,555 with five of
  them in the shell (5,289 of the rest `printf`; `strace -f` natively, the same `config.h`);
  a process costs 5 to 12 ms in Chromium (a loop of 200 `[` took 2.36 s on an earlier round's
  images, one of 200 `[`, `test` and `echo` 2.79 s on round 12's, beside other agents'
  builds), so the difference is 6 to 14 minutes of one configure; Make's configure starts
  `test` 1,898 and `printf` 1,561 times (the survey). Prototyped on `proposal/slop-utilities`:
  Slop includes `src/commands/test.c`
  and `echo.c` (one source, so `test` in the shell and `/bin/test` agree) and runs that code
  when `PATH` finds the name in `/bin`; a command found earlier on `PATH`, a name with a slash
  and a background stage stay programs. Rounds 10 and 11 built it: 200 iterations of `test`
  and `echo` take 0.055 s in Chromium and 0.057 s in Firefox; the Slop, shell, core, man and
  terminal suites passed in both browsers, and `process-browser.mjs` failed where its budget
  checks need a process and wrote `true` (the proposal branch writes `/bin/true`).
  Recommendation: adopt it, with `printf` added.
- **Observation, not a proposal.** `REQUIRES HOST` is a manifest declaration that must follow
  the role line; `REQUIRES TOOL`/`LIB`/`HEADER` are build-time assertions anywhere. One keyword
  carries two meanings with different placement rules.

## Lessons

- A plain `npm run image` stages `src/` while it runs: editing `src/slop.c` during its source
  preparation pinned a half-edited Slop into every recipe and started a 183-image rebuild,
  stopped after six images. Never edit seed inputs while a build in the same tree prepares;
  once the plan line is printed, the build reads only `dist/static`.
- Native probes against dash and Bash found every Slop defect of the night in seconds; the
  browser was needed only to confirm. A probe battery is cheaper than reading 5,400 lines,
  and `cc` of `slop.c` with `native-spawn.c` runs real upstream scripts (Make's configure).
- The corpus decides between POSIX and Bash: counting spellings in the cached sources
  (`${1+"$@"}` 344 times, `cp -p` 72, `set -f` 20, `cd -P` 6) turned "might matter" into a
  measured need, and showed that `readonly` and `hash` do not.
- I guessed a seed round would take an hour and stopped three builds to batch fixes; measured,
  the 22 images of `default` and `system` take 17 to 23 minutes (zig-build about 15), and a
  `system-tools`-only change 71 s. Measure the cost of a round before planning around it.
- A narrowed build (`DOLLY_BUILD_IMAGES=default,system`) also narrows `amy-index.txt`, so a
  test that reads the whole catalog's index (`default-browser.mjs`) fails for a reason that is
  not the change: read a failure's first assertion before attributing it.
- Docs drift where two pages state one fact: `sources.md` was updated when Ninja became
  parallel, `slop.md` and `architecture.md` were not; `slop.md` still denied `/dev/zero` four
  days after the kernel gained it.
- One commit carried three decisions (`ad78dbef`: `for NAME do`, the utilities in the shell,
  the subshell log); when the utilities turned out to need the owner, taking them out was
  hand surgery on `slop.c`, the root recipe and four tests. A design choice gets its own
  commit, so that moving it to a proposal branch is a revert.
- Comparing whole logs finds what outputs hide: FFmpeg's `config.h` was already identical
  when `config.log`'s variable dump still showed `opt=libxeveb`, which led to a `return`
  that never left a `while` loop, on main too.
