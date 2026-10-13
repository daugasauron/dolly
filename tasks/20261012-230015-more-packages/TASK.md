# More programs in amy

- STATUS: OPEN
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

### State at 09:30: 22 packages, every check in Chromium and Firefox

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

### What is left

- The full `test/amy-browser.mjs` in the integration tree, both browsers:
  the `amy tools` case grew by seventeen installs, eight small compiles and
  three programs typed at (17 s here on their own); its limit is 300 s.
- From the list as filed: `file` (dropped, above) and the libraries tmux
  builds for itself (libevent, a terminfo library), which belong with the
  tmux demo's build image as thin packages once that branch is on main.
- `pi-local` could `INSTALL` `llama` in place of its two `COPY` rows.
- Dropped for cost: nano and `ne` (above), GNU sed and grep (gnulib), a roff
  formatter (useful only through `man`). `vi` at the terminal: insert,
  Backspace, Enter, arrow keys and `:wq` were typed and work.

### pigz (09:50)

`gzip` here is Dolly's own and only unpacks (`gzip: Dolly version 0
intentionally implements decompression to stdout only`), so nothing wrote a
`.gz` or a `.tar.gz`. `pigz` 2.8 (zlib's author's gzip, from the release
archive as published, `NOTHREAD`, with the Zopfli it vendors and the `zlib`
package) does: 9 files, 507 KB. Its check packs 20,000 lines smaller and
back, and the image's `gzip -dc` reads what it wrote; the tar check now
goes `tar -cf - in | pigz | gzip -dc | tar -tf -`. Both browsers. tar's
advice (recipe and README) names pigz, bzip2, xz and zstd.
