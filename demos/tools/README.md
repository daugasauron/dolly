# Tools

Everyday command-line programs as packages: `amy install NAME` in a running
session. Each is built inside Dolly from a pinned upstream release, unchanged:
by `cc` and a Makefile in the recipe, wabt by its own CMake, Meson from its
wheel by pip. Slop does not run a configure script, so a recipe states what
the script would find here, in the comments beside its flags.

## Images

- `sqlite`: SQLite: the `sqlite3` shell, and its library and headers for programs the `cc` package builds, as a package.
- `jq`: jq, the JSON processor, with regular expressions, as a package.
- `xz`: XZ Utils: `xz`, `unxz`, `xzcat` and liblzma, as a package.
- `zstd`: Zstandard: `zstd`, `unzstd`, `zstdcat` and libzstd, as a package.
- `bzip2`: bzip2: `bzip2`, `bunzip2`, `bzcat` and libbz2, as a package.
- `lz4`: LZ4: `lz4`, `unlz4`, `lz4cat` and liblz4, as a package.
- `zip`: Info-ZIP's `zip`, with the `unzip` package, which `zip -T` starts, as a package.
- `unzip`: Info-ZIP's `unzip` and `zipinfo`, as a package.
- `tree`: tree, which draws a directory as a tree, as a package.
- `bc`: the `bc` and `dc` calculators (Gavin Howard's), as a package.
- `vi`: Neatvi, a small `vi` and `ex` that needs no terminal database, as a package.
- `xxd`: xxd, the hex dump that also reads one back, as a package.
- `base64`: `base64` (Alfred Klomp's) and libbase64, as a package.
- `yacc`: Berkeley Yacc, as `yacc` and `byacc`, as a package.
- `flex`: flex 2.5.4 as Thomas Dickey maintains it (reflex), which starts no m4, also as `lex`, with libfl and the `yacc` package, as a package.
- `wabt`: the WebAssembly Binary Toolkit: `wat2wasm`, `wasm2wat`, `wasm-objdump`, `wasm-strip` and `wasm-validate`, as a package.
- `meson`: Meson, with the `python`, `cc` and `ninja` packages it runs on, as a package.
- `tar`: sbase's `tar`, which writes archives and reads links and pax headers, in place of the one that only unpacks, as a package.
- `sbase`: the sbase commands the image leaves out: `yes`, `cal`, `sha1sum`, `sha512sum`, `sponge`, `cols`, `uuencode` and `uudecode`, as a package.

What the platform decides ([process model](../../docs/process-model.md)):

- The compressors and SQLite run on one thread: a `-pthread` program needs
  `threads@0`, and so would every program that links such a library.
- `sqlite3` holds a database's lock while it has the database open
  (`SQLITE_DEFAULT_LOCKING_MODE=1`), so a second process is told `database is
  locked`. A write-ahead log needs memory two processes share and a mapping
  is a private copy; in this mode its index is on the heap. SQLite loads no
  extension.
- The terminal has no line discipline: nothing echoes a line, edits it or
  turns Enter into a newline for a program that only reads one. So `sqlite3`
  is built with linenoise, `dc` edits its lines as `bc` does, and `vi` reads
  Enter through a few lines the recipe adds, which is the one change to an
  upstream source here. A question that waits for a line gets none: answer
  it on the command line (`unzip -o` or `-n`, `zstd -f`) or end it with Ctrl+C.
- Dolly's `tar` reads files and directories. An archive with a pax header
  (every `git archive`) or links is staged as a plain tar of the files a
  build reads ([`prepare-sources.sh`](prepare-sources.sh)); `sqlite`, `xz`,
  `bzip2`, `zip`, `unzip`, `yacc` and `flex` build from the archive as
  published.
- `fork` fails: `vi`'s `!` commands and language servers, and `tar`'s `-z`,
  `-j` and `-J`, which start the compressor that way, say so. Pipe an
  archive through `gzip`, `bzip2` or `xz`.
- `/bin` comes before `/usr/bin`, so `tar` installs over the core's
  `/bin/tar`; no other package here replaces a command.

Test: the `amy tools` case of [`test/amy-browser.mjs`](../../test/amy-browser.mjs)
installs each into `default`, uses it, links a program with each library and
types at the terminal into `sqlite3`, `dc` and `vi`; `amy meson alone`
builds a project in a session that had no compiler.
