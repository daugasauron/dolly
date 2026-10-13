# More programs in amy

- STATUS: CLOSED
- PRIORITY: 325
- TAGS: packages,amy

Owner (2026-10-13): "I want more things in amy still."

Done when: the programs listed here install into `default` with `amy`, each
built inside Dolly from a pinned source, each with its check in
`test/amy-browser.mjs` in Chromium and Firefox.

## As filed

- The catalog has 49 packages (main `7dde6b3d`). What a person at a shell
  reaches for and does not find: an SQL database, a JSON tool, archivers
  besides `tar` and `gzip` (zip, xz, zstd, bzip2), a small editor, `tree`,
  `bc`, `file`, and the libraries tmux builds for itself (libevent, a
  terminfo library).
- The rule for what is a package is in
  [packages](../20261012-130814-packages/TASK.md), "What makes sense".

## 2026-10-13: the tools demo (branch `core/more-packages`)

The packages live in `demos/tools/`: recipes, `prepare-sources.sh`, a README
with one row each. Every one is `FROM system-tools` and built by `cc` there
with a Makefile in the recipe, as `less` is: Slop runs no configure script, so
the recipe states the answers. Nothing at the top level grew except pins
(`config/source-pins.sh`), `config/upstreams.json`, `docs/licences.md`,
`config/domain-pages-images.txt` and the checks in `test/amy-browser.mjs`.
No image input changed.

### Decisions

- **Names** are the command a person types: `sqlite`, `jq`, `xz`, `zstd`,
  `bzip2`, `lz4`, `zip`, `unzip`, `tree`, `bc`, `vi`, `xxd`, `base64`.
- **One package per upstream**, the tool with its library and headers where
  upstream has a library (`sqlite`, `xz`, `zstd`, `bzip2`, `lz4`): none
  installs `cc`. `zip` installs `unzip`, because `zip -T` starts it; `sqlite`
  installs `zlib`, which its shell links for archives.
- **One thread** everywhere (`SQLITE_THREADSAFE=0`, xz `--disable-threads`,
  zstd and lz4 without their thread pools): a `-pthread` program needs
  `threads@0`, and so would every program linking such a library.
- **SQLite locks a database for the process that has it open**
  (`SQLITE_DEFAULT_LOCKING_MODE=1`). A write-ahead log keeps its index in a
  mapping two processes share; `docs/process-model.md` says a mapping is a
  private copy written back at `munmap`, so two processes on one WAL database
  would each see a stale index and the last to close would checkpoint with
  it. In exclusive mode the index is heap memory and the second process gets
  `database is locked`, which the test asserts. `SQLITE_OMIT_WAL` was the
  other honest setting; it makes every WAL database (most that people
  download) unreadable. No loadable extensions (`dlopen` needs `-rdynamic`
  and `dso@0`).
- **bc is Gavin Howard's** (FreeBSD's and macOS's): GNU bc generates
  `libmath.h` with `ed`, and its release is no newer.
- **vi is Neatvi**: nano needs a curses library with a terminfo database and
  generated sources; Neatvi draws with its own escape sequences, builds from
  twenty C files and has an `ex` mode for scripted edits.
- **xz**: upstream's `mythread.h` gives a Wasm target other than Emscripten
  no `mythread_sigmask`. Dolly has `sigprocmask`, so the recipe says
  `-Dmythread_sigmask=sigprocmask` for the program's objects rather than
  claiming `__EMSCRIPTEN__`.
- **xxd** is one file of Vim's repository at a tag, with its manual page;
  **base64** is Alfred Klomp's (a library and a program with GNU's `-d` and
  `-w`), built with none of its x86 and ARM codecs.
- **Lines typed at the terminal** (see the measurement below): `sqlite3` is
  built with linenoise 2.0, which upstream's configure supports
  (`--with-linenoise`); `dc` is given bc's line editor (`dc.tty_mode`, off by
  default upstream); Neatvi leaves Enter to the terminal's `ICRNL`, so
  `term.c` is compiled with a six-line header that turns a carriage return
  it reads into a newline. That header is the only change to an upstream
  source in the demo; its reason is in the recipe.
- **Not `ne`** (the nice editor): its tagged source generates six files with
  makeinfo and Perl, and upstream publishes no archive that holds them.
- **Not `file`**: `core` holds Dolly's own `/bin/file` and `PATH` is
  `/bin:/usr/bin`, so an upstream `file` in `/usr/bin` would never start,
  and replacing a core command is not a package's to do.

### What the platform lacked (measured)

- **`tar` reads only regular files and directories** (`Dollyfile-system-build`,
  `tar.c`: types `0` and `5`). Four of the ten release archives stop it at
  the first entry, `pax_global_header` (every `git archive`: zstd, lz4, tree,
  Neatvi), jq's at a hard link in `docs/`, and bc's holds 76 symbolic links:
  `tar: validate path at pax_global_header (errno 138)`. Those six are staged
  by `prepare-sources.sh` as plain tars of the files a build reads, the way
  most of the catalog is; sqlite, xz, bzip2, zip and unzip are the archives
  as published. It also creates nothing (`tar -c`), and a package cannot
  bring another `tar`: `/bin` precedes `/usr/bin`. A `tar` that skips pax
  headers and writes archives is a change to an image input.
- **The terminal has no line discipline** (`docs/process-model.md` says so:
  reads return raw bytes; `ICANON` and `ECHO` only round-trip). Measured in
  Chromium on `default`: `sqlite3` as upstream builds it shows its prompt
  and then nothing typed, and Enter (a carriage return) never ends the line;
  `dc` the same; `unzip`'s `replace f? [y]es, [n]o…` and `zstd`'s
  `overwrite (y/n) ?` wait for ever; in Neatvi `:wq` and Enter printed a
  stray glyph and wrote nothing. `bc`, with a line editor of its own, works.
  Every upstream program that reads a line from the terminal with `fgets` is
  affected, whatever package brings it. A line discipline in the kernel's
  terminal (echo, erase, CR to NL while `ICANON` is set) is a change to the
  kernel, not to an image input.
- **sbase's `od` rejects `-t o1`** at the pinned commit (its `-t` loop does
  not step over the size digit and takes `1` for a type): upstream jq writes
  `builtin.inc` with `od -t o1 | sed`, so the recipe compiles a five-line C
  program for it. `od -b` is the same output for a person.
- **Unix source that names no header**: unzip 6.0 calls `read`, `write` and
  `lseek` through declarations of its own unless the system says it is BSD
  4.4 or System V; `wasm-ld: warning: function signature mismatch: read` and
  the program traps (`unreachable`) at its first read. `-include unistd.h`
  is the answer, as `less` gives termcap; a native ELF link never notices.
- jq and xz need `_GNU_SOURCE`, which `AC_USE_SYSTEM_EXTENSIONS` defines for
  them: the recipes say so.

### Result (2026-10-13 09:00, images built in this tree)

Thirteen packages install into `default` and pass their checks in Chromium
and Firefox (`build/more-evidence/tools-case.mjs` runs the entries of the
`tools` and `typed` tables of `test/amy-browser.mjs` after `amy install cc`,
which is what `zig` leaves in the full case; the full file needs every image
of the catalog and runs in the integration tree). Each install takes 0.1 to
0.25 s. Sizes are what `amy install` reports:

| Package | Files | Bytes | Commands | The check |
| --- | --- | --- | --- | --- |
| `sqlite` | 11 | 5,639,684 | `sqlite3` | a table written, summed and read as JSON; a second process refused; a C program linked; a query typed at the prompt |
| `jq` | 4 | 1,258,929 | `jq` | a sum, and a regular-expression capture |
| `xz` | 22 | 821,789 | `xz` `unxz` `xzcat` | 20,000 lines packed smaller and back, as a file and a pipe; liblzma linked |
| `zstd` | 9 | 1,857,378 | `zstd` `unzstd` `zstdcat` | the same; libzstd linked |
| `bzip2` | 8 | 301,670 | `bzip2` `bunzip2` `bzcat` `bzip2recover` | the same; libbz2 linked |
| `lz4` | 11 | 524,972 | `lz4` `unlz4` `lz4cat` | the same; liblz4 linked |
| `unzip` | 5 | 304,198 | `unzip` `zipinfo` | a stored archive listed and unpacked |
| `zip` | 8 | 700,831 | `zip` (+ `unzip`) | a tree zipped, `zip -T`, unzipped to the same bytes |
| `tree` | 3 | 182,280 | `tree` | a directory listed, and as JSON |
| `bc` | 6 | 599,170 | `bc` `dc` | 2^64 and pi to 20 places; `dc` typed at the terminal |
| `xxd` | 3 | 66,223 | `xxd` | a dump, and a dump read back to the same bytes |
| `base64` | 4 | 103,200 | `base64` | encoded and decoded; libbase64 linked |
| `vi` | 4 | 242,573 | `vi` `ex` | a substitution by `ex`; two lines typed in `vi` and written with `:wq` |

An image builds in 5 to 15 s once its base is restored (SQLite 33 s).

### Thin packages the integrator asked for (09:00)

- `llama` (`demos/local-llm`): `dolly-llama` and its licences, kept from
  `local-llm-build`; 11.1 MB. It declares `gpu@0`, so `default` refuses it by
  that name and installs nothing (`amy tools` asserts it, both browsers):
  `Dollyfile-llama needs gpu@0: add REQUIRES HOST gpu@0`. `pi-local` still
  takes the same files with two `COPY` rows; it could `INSTALL` this instead
  (not done: its image is not this branch's to build).
- `openal` (`demos/zero-ad`): OpenAL Soft's library, headers, CMake and
  pkg-config files, kept from `openal-build`; 15 files, 3.4 MB. It asks for
  **no host module**, not `audio@0`: the library is built with every playback
  backend off, and 0 A.D. renders through `alcLoopbackOpenDeviceSOFT` and
  writes the samples to `audio@0` itself (`engine.patch`). So it installs
  into `default`, and `amy programs` compiles a C++ program that plays a
  square wave from a buffer and finds it in the rendered samples (both
  browsers).
- Both build images were cache hits in this tree's plan
  (`reuse local-llm-build`, `reuse openal-build`).

### tar and sbase (09:10)

- `tar` is sbase's, built from the archive `system-tools` already stages
  (same pin, no new upstream): it writes archives and reads symbolic and
  hard links, GNU long names and pax headers. It installs **over
  `/bin/tar`** (and over the core's page in `cat1`, which `man` reads
  first): `/bin` precedes `/usr/bin`, so anywhere else it would never start.
  The engine accepts a package that replaces a file; `amy files tar` lists
  the three. 78 KB. `-z`, `-j`, `-J` fork the compressor and fail by name
  (`tar: fork: Function not implemented`); `tar -cf - dir | gzip` works.
  The check: `tar -c` fails before the install; after it a tree with a link
  is archived, unpacked to the same bytes and link, and listed through a pipe.
- `sbase` holds the sbase commands `posix` leaves out and people type:
  `yes`, `cal`, `sha1sum`, `sha512sum`, `sponge`, `cols`, `uuencode`,
  `uudecode`; 17 files, 404 KB. One package, as the integrator asked;
  `base64` stays its own (another upstream, with a library). `yes | head`
  ends: the pipe's reader going away stops the writer.
- **No `chmod`**: main has no file modes (`docs/process-model.md`: "one user
  and no permission bits: `chmod`, `chown` and `access` only check that the
  file exists"). A `chmod` command would report success and change nothing.
  Not `ed` either: it reads its commands a line at a time from the terminal,
  which has no line discipline; `ex` (the `vi` package) edits by script.
- Both in Chromium and Firefox, with the entries of `test/amy-browser.mjs`.

### meson (09:15)

- `meson` is Meson 1.12.1 from the wheel PyPI publishes (a `SOURCE` with its
  SHA-256), installed by `pip install --no-index --no-deps`. It `INSTALL`s
  `python`, `cc` and `ninja` (Python runs it, `meson setup` starts the
  compiler, `meson compile` starts Ninja) and declares Python's host modules
  (`dso@0`, `http@0`, `sockets@0`), which `default` has. The recipe builds a
  project as its check; the image builds in 26 s on cached bases.
- Alone in `default` (no compiler before): 3,765 files, 177 MB in 3.1 s;
  `meson setup build && meson compile -C build` and the program's status 42
  in 6.4 s (Chromium) and 6.9 s (Firefox). Meson finds `clang` ("dolly
  toolchain: Clang/LLD 24, wasm64-unknown-dolly"), `ld.lld` and
  `ninja-1.9.0`, cpu family `wasm64`.

### yacc, lex and wabt (09:20)

- `yacc` is Berkeley Yacc 20260126 (Thomas Dickey's), from the release
  archive as published; `flex` is his reflex 20260131: flex 2.5.4, kept up,
  under the name upstream installs it by, and as `lex`. flex since 2.5.31
  pipes its skeleton through `m4` by `fork`, which fails here; this one
  writes the scanner itself. Its grammar is compiled by yacc when the image
  is built, so `flex` installs `yacc`. jq's
  first build here stopped at `make: yacc: No such file or directory`
  (make's built-in rule, the grammar being newer than the parser it ships):
  a port that regenerates a parser now has the two commands. It says what
  it is (`flex version 2.5.4`): a grammar that wants a reentrant scanner
  fails at that option.
- `wabt` is the WebAssembly Binary Toolkit 1.0.42 from its source release
  (an `.tar.xz` with its submodules), built by its own CMake `FROM
  cmake-build` as `sdl2` is: `wat2wasm`, `wasm2wat`, `wasm-objdump`,
  `wasm-strip`, `wasm-validate`. Not built: the interpreter, `wasm2c` and
  their runtime (a Dolly program is not what they run).

### Gaps seen on the way, not fixed here

- **`sed -i` and `grep -r`** (also `-o` and context lines) are what an agent
  types most, and sbase's `sed` and `grep` have neither. GNU's need gnulib's
  configure answers by the hundred; ripgrep covers the second. The cheap fix
  is in the commands Dolly owns or in sbase's list, both image inputs.
- **`man` prints a `man1` page as roff source.** Every upstream page here is
  one. A formatter (mandoc) as a package helps only if `man` pipes through
  it, which is the core's.
- **`chmod`**: there are no modes, so none; a script that runs `chmod +x`
  stops at `command not found`.

### A saved session (09:25)

`amy install tar sqlite vi`, an archive and a database written, the session
saved and reopened (`build/more-evidence/session-case.mjs`, Chromium and
Firefox): the replaced `/bin/tar` lists the archive, `sqlite3` reads the
database, `vi` is there and `amy installed` names the packages. 6.0 MB of
changes, 2.2 MB stored.

### State at 09:30: 22 packages (23 with pigz, below), every check in Chromium and Firefox

Besides the thirteen of the table above: `llama` (refused in `default`),
`openal` (15 files, 3.4 MB), `tar` (3 files, 78 KB), `sbase` (17 files,
404 KB), `meson` (with python, cc and ninja: 3,765 files, 177 MB), `yacc`
(4 files, 190 KB), `flex` (10 files, 571 KB) and `wabt` (12 files, 6.4 MB;
its 60 C++ files compile here in 45 s, the image in 67 s). The last run of
every entry on the committed tree: `tools-all-5.log` (17 table entries,
openal, tar, the llama refusal, the three typed at the terminal: Chromium
17.1 s, Firefox 14.9 s) and `meson-2.log` under `build/more-evidence/`.

`wabt` reads what `cc` links here: `wasm-objdump -x` of a Dolly program
shows its 64-bit memory. A recipe's `SLOP` runs with `-e`: a check that
wants a program's non-zero status must capture it, not let it end the line
(flex's first check stopped on its own right answer).

The full `test/amy-browser.mjs` was not run here: it installs every package
of the catalog, and this tree builds only the images named above. It is for
the integration tree.

### pigz (09:50)

`gzip` here is Dolly's own and only unpacks (`gzip: Dolly version 0
intentionally implements decompression to stdout only`), so nothing wrote a
`.gz` or a `.tar.gz`. `pigz` 2.8 (zlib's author's gzip, from the release
archive as published, `NOTHREAD`, with the Zopfli it vendors and the `zlib`
package) does: 9 files, 507 KB. Its check packs 20,000 lines smaller and
back, and the image's `gzip -dc` reads what it wrote; the tar check now
goes `tar -cf - in | pigz | gzip -dc | tar -tf -`. Both browsers. tar's
advice (recipe and README) names pigz, bzip2, xz and zstd.

### What is left

- The full `test/amy-browser.mjs` in the integration tree, both browsers:
  the `amy tools` case grew by eighteen installs, eight small compiles and
  three programs typed at (17 s here on their own); its limit is 300 s.
- From the list as filed: `file` (dropped, above) and the libraries tmux
  builds for itself (libevent, a terminfo library), which belong with the
  tmux demo's build image as thin packages once that branch is on main.
- `pi-local` could `INSTALL` `llama` in place of its two `COPY` rows.
- Dropped for cost: nano and `ne` (above), GNU sed and grep (gnulib), a roff
  formatter (useful only through `man`). `vi` at the terminal: insert,
  Backspace, Enter, arrow keys and `:wq` were typed and work.

## 2026-10-13: the root recipe's C programs as files (branch `core/commands-source`)

Asked by the integrator after three auditors found it: `Dollyfile-system-build`
held 23 C programs in `FILE` bodies. They are `src/commands/NAME.c` now
(`ar bracket cat cc cd clear cp cxx echo file foreground help ld ls man mkdir
mv pwd rm stat tar test touch`), byte for byte, staged as
`dist/static/default/commands/` and brought by one `SOURCE` row each to the
path the `FILE` wrote; no compile row changed. The recipe went from 2,248
lines (85,205 bytes) to 475 (20,946). Left inline there: the manual page of
`test` and the Makefile that builds libc++. `Dollyfile-system-tools` still
holds `download.c` and `upload.c` inline: the same kind, not this job's.

Proof that nothing changed (`build/more-evidence/root/compare-snapshots.mjs`,
every record by path, kind and SHA-256, before and after):

| Image | Records | Identical | Programs in `/bin`, `/usr/bin` | What differs |
| --- | --- | --- | --- | --- |
| `system-build` | 2,107 | 2,103 | 26 of 26 identical | the recipe's text: `/etc/dolly/Dollyfile`, `recipes/Dollyfile-system-build`, `artifact`, `recipes.lock` |
| `default` | 212 | 196 | 84 of 84 | 16 records under `/etc/dolly`: recipes, pins, receipt |
| `system` | 2,312 | 2,299 | 95 of 95 | 13 records under `/etc/dolly` |

Eighteen of the files compile natively with `-Wall -Wextra -Werror`; the four
proxies and `foreground` need Dolly's runtime to link. `commands.test.mjs`
and `tar.test.mjs` compile the files where they read the recipe's bodies.

Run on the chain rebuilt from the moved root (25 images, `system-build` in
69 s, to `default` and the images the suite opens):

- the source suite with the demos' tests: 424 of 424;
- the core browser suite, 34 files, `fs-growth` among them, in a `hugebuild`
  slot: Chromium all passed in 457 s, Firefox all passed in 548 s
  (`core-suite.mjs` is `test/browser-tests.mjs` without `amy-browser.mjs`,
  whose other cases install the whole catalog);
- amy's cases about `default` itself (`amy`, `amy cc`, `amy refusal`, from
  `test/amy-browser.mjs` unchanged): both browsers;
- not run: Pi's demo test. `pi` installs ripgrep and fd, and this tree cannot
  rebuild the Rust chain; the round runs it.

Logs and the comparisons are under `build/more-evidence/root/`.

## 2026-10-13: manual pages as text (branch `core/man-pages`)

Asked by the integrator: `man` prints a page of text in `cat1` as it is and
has no formatter, so an upstream page in `man1` read as roff source (the gap
noted above).

### Decisions

- **`mandoc`** (1.14.6, the release archive as published, with a `config.h`
  that states what its configure would find) is a package of `demos/tools`:
  the formatter for a person, with its own page. Of the programs the archive
  can be, only `mandoc` is installed; `man` stays the core's.
- **A page is formatted when its package is built**, as UTF-8 text of 78
  columns with mandoc's overstrikes taken out, into
  `/usr/share/man/cat1/NAME.1`; the page of macros is no longer kept. A
  reader without a pager, an agent among them, gets the words.
  `text-page PAGE...` does it; awk takes the overstrikes out in a UTF-8
  locale, so a letter outside ASCII loses its overstrike whole (the
  toolchain's recipe checks `café`).
- **The formatter comes from the base, not from an `INSTALL` row.** Since
  this round an `INSTALL` in a package's recipe is a row of the package:
  amy installs it first. A row for mandoc would put mandoc and zlib into
  every session that installs `tree`. So the packages are built
  `FROM tools-build`, a build-only toolchain (`cmake-build` with the mandoc
  package and `text-page`). A package keeps nothing of its base, and its
  record names no formatter.
- **`tools-build` is on `cmake-build`**, which wabt needs, and not on
  `system-tools`: tried, and wabt then has no way to the formatter for its
  build alone (`COPY` may not write under `/tmp`; measured, `COPY failed
  (-28)`). The cost: a package of this demo now waits for `cmake-build`
  when the seed changes (1482 s here, alone in the slot).
- **`lua` and `nvim` had no page** and get upstream's (`doc/lua.1`,
  `src/man/nvim.1`) the same way: each recipe is `FROM tools-build`, reads
  the page out of the archive `neovim-build` compiles, and takes its files
  from `neovim-build` by `COPY` (`lua` took them by `FROM` before).
- **The test reads a word of each page** and that no line begins with a
  macro (`.TH`, `.SH`, `.Dd`, `.Sh`): `pages` in `test/amy-browser.mjs`.

### Not reached, and why

- **`less`, `ninja`, `posix`** (the core's packages with roff pages: one,
  one and 45). A core recipe may not depend on a demo, and mandoc is a
  package of `demos/tools`. With mandoc and `text-page` at the top level
  each is one changed line and a `FROM`. `ninja` is also an `INSTALL` of
  `python`, whose pin is in the chains of `llvm-tablegen`, `rust-llvm`,
  `mojo-llvm` and `zero-ad-spidermonkey`; `posix` is in `default` and in
  `rust-build`. `less` has no dependent.
- **Pages still in `default` as macros** (`awk.1` and sbase's): they come
  with `posix`. `mandoc /usr/share/man/man1/find.1` reads one after
  `amy install mandoc`.
- **Without a page though upstream has one**: `python` (`Misc/python.man`;
  its pin is in the four chains above), `emacs` (`doc/man` is not in the
  staged source and the recipe builds Emacs itself), `cargo`, `rust`, `fd`
  (the Rust chain is not built in this tree), `cmake` (its pages are
  written by Sphinx, not in the archive), `pkgconf` (prints `--help`; in
  0 A.D.'s chain).
- **Without an upstream page**: `vi` (Neatvi), `base64`, `javascript`,
  `llama`, `openal`, `mojo`, `pi`.

### `grep -r` and `sed -i`: the `toybox` package

Asked by the integrator: the two an agent types most, as a package.

- **toybox 0.8.15**, its `grep` and `sed` alone, one program under both
  names (`toybox grep` also works): 188 kB installed, with its two pages
  and licence. GNU grep and sed were not
  tried again: gnulib's answers by the hundred, as above.
- **It installs over `/bin/grep` and `/bin/sed`** of `posix`, with links to
  `/usr/bin/toybox`: `/bin` is first on `PATH`, so a `grep` in `/usr/bin`
  would never start. Its `cat1` pages for both (each command's `--help`)
  come before `posix`'s pages of macros, so `man grep` describes the
  `grep` that runs.
- **One build step runs outside Dolly**: toybox's headers (configuration,
  option flags, help) are written by its bash scripts and three small
  generators compiled for the host. `demos/tools/prepare-toybox.sh` runs
  them for a configuration of `grep` and `sed` and stages the result; the
  recipe compiles every file of C. Two runs gave the same six headers.
- **What the source needed here** (each with its reason in the recipe):
  the three `#error` lines that stop the compiler on a system toybox does
  not know are taken out with `sed` (the one change to the source);
  `-include sys/statfs.h`, which it names for Linux alone; `syscall()`
  defined away (not in Dolly's libc; toybox reaches it only with a number
  it does not find); and `tempfile_handler` given the `int` argument its
  caller passes: without it `sed -i` did its work and then trapped at exit
  (`function signature mismatch`), which a native ABI lets through.
- **Not brought: toybox's `find` and `xargs`.** They start `-exec`'s
  command and the command line by `fork` or `vfork` (read in
  `lib/xwrap.c`, not measured), which Dolly has not, and the core's do
  start them.

Measured in Chromium on `default` over a small tree, the core's commands
and the same session after `amy install toybox`
(`build/more-evidence/man/core-text-*.log`):

| | core | with `toybox` |
| --- | --- | --- |
| `grep -r`, `-rl`, `--include`, `--exclude-dir` | usage error | yes |
| `grep -o` | usage error | yes |
| `grep -A`, `-B`, `-C` | usage error | yes |
| `grep --color` | usage error | yes |
| `grep -P` | usage error | no: unknown option |
| `grep -E -F -f -i -v -w -c -l -n -q -x` | yes | yes |
| `sed -i`, `-i.bak` | usage error | yes |
| `sed -z` | usage error | yes |
| `sed 's/a/b/I'` | no error, nothing replaced | yes |
| `sed -E`, `-n`, ranges, `\n` and `\t` in `s` | yes | yes |
| `sed 'a\text'` on one line | `text` | a tab and `ext` |
| `find -name -type -maxdepth -path -prune -not -print0 -exec` | yes | the core's |
| `find -iname -newer -size -mtime -delete` | unsupported predicate | the core's |
| `xargs -0 -n -I` | yes | the core's |
| `grep -rl x . \| xargs sed -i s/x/y/` | usage errors | yes |

The one row where toybox does less well than sbase is `a\text` written on
one line when the text begins with a letter that makes an escape.

### An editor that is not vi: `dte`

- **dte 1.11.1** (GPL-2.0-only, 27 000 lines of C): the keys of a desktop
  editor (Ctrl+S saves, Ctrl+Q quits, Ctrl+Z undoes, Ctrl+F searches,
  Ctrl+C, Ctrl+X and Ctrl+V on a selection), syntax colours for 49
  languages, undo, several files in tabs. It draws with its own escape
  sequences and reads no terminal database, so it needs no curses.
- **Not nano**: it needs a curses library, which here would be NetBSD's
  built on `libterminfo` (not built: a second port before the first key),
  and since 2.9 its source is gnulib's too.
- Built by a Makefile in the recipe: upstream's own asks the compiler ten
  questions through `sh` scripts, and `feature.h` in the recipe holds the
  answers. The key bindings, colours and syntax files it holds are every
  file of `config/`, as upstream's makefile lists them.
- Its raw mode only clears flags and asks for one byte at a time, which
  the terminal accepts (the measurement below says what it refuses). Typed
  in a session: text, undo, a search, its command line (Alt+x), arrow keys,
  Ctrl+S, Ctrl+Q; the terminal is as it was afterwards.
- **One line of the source is changed**: dte takes a stream for the
  terminal when `tcgetpgrp` answers for it, and here it fails with `Not a
  tty` (there are no process groups), so dte stopped with status 71 before
  its first screen. The recipe makes the test `isatty`.
- **`select` fails and dte goes on**: it asks `select` only whether more
  bytes follow a lone Escape, and takes the failure (`ENOSYS`, measured;
  `poll` works) for none. Escape, then Alt+x, each did what it should.
- Ctrl+Q closes Firefox on Linux, and Ctrl+W a tab: a person there quits
  with Alt+x, `quit`.

### State at 13:05: every check in Chromium and Firefox

Built in this tree on the round's seed (`ee311115…`): `mandoc`,
`tools-build`, the 18 packages with a page, `toybox`, `dte`, `tmux` with
`tmux-panes`, and `neovim-build`, `lua`, `nvim`, `neovim` (`lua` and `nvim`
had no page; both get upstream's). The entries of `amy tools` for the 21
packages of `demos/tools` in the table, `tar`, `lua` and `nvim`, and `amy
meson alone`, pass in both browsers; each reads its page as text. `man
sqlite3`, `man jq` and `man xz` print the same text in both and no line
begins with a dot and a letter. With `toybox` installed first, the checks
of the other 20 packages pass on its `grep` and `sed` (Chromium). The tmux
demo's test passes in both, Neovim's in Chromium.

## 2026-10-13: a question at the terminal (measured; nothing changed)

Asked by the integrator: what exactly happens when `unzip` and `zstd` ask
before they overwrite. Chromium and Firefox on `default`, the same in both
(`build/more-evidence/man/tty-probe-*.log`; the probe is a C program
compiled in the session, and keys are pressed one at a time).

**What the program calls.** unzip 6.0 prints `replace f? [y]es, [n]o,
[A]ll, [N]one, [r]ename: ` and calls `fgets(G.answerbuf, 10, stdin)`
(`extract.c:1489`); it sets no terminal mode for the question. zstd 1.5.7
prints `overwrite (y/n) ? `, calls `getchar()` for the answer and then
`getchar()` until it has read `'\n'` (`programs/util.c:138-146`). Both
reach the terminal as `read(0, …)` under stdio.

**What the terminal answers.**

- `read(0, buf, 16)` returns as soon as one byte is there, with the byte
  the page sent: `y` is `79`, Enter `0d`, Backspace `7f`, Ctrl+J `0a`,
  Ctrl+D `04`. Each key was a read of one byte (`src/process-kernel.c`,
  the read of a terminal descriptor: what is queued, at least one byte).
- Nothing typed is shown, Enter stays a carriage return, Backspace erases
  nothing, and Ctrl+D is a byte and no end of input.
- `tcgetattr` says `ICANON`, `ECHO` and `ISIG` are set (`ICRNL` clear,
  `VMIN` 1): the first two are stored and reported
  (`terminal_mode_flags` in `src/dolly.c`) and nothing consults them, so a
  program that asks is told of a line discipline that is not there.
- `tcsetattr` with `ICRNL` set fails with `EINVAL`
  (`terminal_mode_from_attributes` in `src/process/libc-adapter.c`): a
  program cannot ask for the mapping either.
- `tcgetpgrp` fails with `ENOTTY` and `select` with `ENOSYS` (both met
  with dte, above); `poll` waits and answers.

**Where it waits.**

- `fgets(line, 9)` after `y` and Enter is still in `read`; after Ctrl+J it
  returns `79 0d 0a`. Eight characters without Enter fill it and it
  returns.
- unzip: `y` (nothing shown) and Enter leave it in that `fgets`. Ctrl+J:
  `extracting: f`, status 0; it looks at the first byte alone. `y`, Ctrl+J
  without Enter does the same.
- zstd: `y` and Enter leave it in the loop that reads up to `'\n'`.
  Ctrl+J: it compresses, status 0. After `n` it prints `Not overwritten`
  at once (the answer was read) and stays in the same loop until Ctrl+J,
  status 1.
- So neither waits for ever, as was written above: each waits for the byte
  `0a`, which Enter does not send and Ctrl+J does. Ctrl+C ends either.

**The same wait elsewhere.** `cat` with no file (the core's: `fread` of
4096 bytes) shows nothing and does not end at Ctrl+D; Slop's `read answer`
and Python's `input()` return at Ctrl+J and not at Enter. The programs
that work at the terminal take keys raw and treat `0d` as Enter
themselves: Slop's prompt, `bc`, `sqlite3` with linenoise, `vi` with its
header, `dte`, Neovim, tmux.

**What these programs would need of a line discipline**, as facts for its
design: while `ICANON` is set, a read gets a whole line with `0d` turned
into `0a`, the line is shown as it is typed (`ECHO`), `7f` erases, and
`04` on an empty line ends the read with 0 bytes; while it is clear,
reads are as they are now. The two flags already travel through
`tcgetattr` and `tcsetattr`.

## Closed (2026-10-13)

In the round of 2026-10-13 (`integrate/round-1013`, version 0.1.3, 135 images): the catalog went from 49 packages to 79. Of this task: `sqlite`,
`jq`, `xz`, `zstd`, `bzip2`, `lz4`, `pigz`, `zip`, `unzip`, `tree`, `bc`,
`xxd`, `base64`, `vi`, `dte`, `yacc`, `flex`, `wabt`, `meson`, `tar`,
`sbase`, `toybox`, `mandoc`, `openal`, `llama`; beside it `tmux`,
`libevent`, `libterminfo`, `nena` and `mojo`. Each is installed into
`default` and used by `test/amy-browser.mjs`, which passed in Chromium and
Firefox on the round's images, or is refused there by the name of the
module it needs. Not done and still wanted (`chmod`, `file`, the pages not
reached, the question at the terminal) is in
[what waits](../20261012-220109-next-round/TASK.md).
