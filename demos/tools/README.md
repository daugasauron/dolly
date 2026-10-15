# Tools

Everyday command-line programs as packages: `amy install NAME` in a running
session. Each is built inside Dolly from a pinned upstream release, unchanged:
by `cc` and a Makefile in the recipe, wabt and Binaryen by their own CMake, Meson from its
wheel by pip. Slop does not run a configure script, so a recipe states what
the script would find here, in the comments beside its flags.

## Images

- `sqlite`: SQLite: the `sqlite3` shell, and its library and headers for programs the `cc` package builds.
- `jq`: jq, the JSON processor, with regular expressions.
- `xz`: XZ Utils: `xz`, `unxz`, `xzcat` and liblzma.
- `zstd`: Zstandard: `zstd`, `unzstd`, `zstdcat` and libzstd.
- `bzip2`: bzip2: `bzip2`, `bunzip2`, `bzcat` and libbz2.
- `lz4`: LZ4: `lz4`, `unlz4`, `lz4cat` and liblz4.
- `pigz`: pigz, which writes the `.gz` files `gzip` here only reads, and `unpigz`.
- `zip`: Info-ZIP's `zip`, with the `unzip` package, which `zip -T` starts.
- `unzip`: Info-ZIP's `unzip` and `zipinfo`.
- `tree`: tree, which draws a directory as a tree.
- `bc`: the `bc` and `dc` calculators (Gavin Howard's).
- `vi`: Neatvi, a small `vi` and `ex` that needs no terminal database.
- `xxd`: xxd, the hex dump that also reads one back.
- `base64`: `base64` (Alfred Klomp's) and libbase64.
- `yacc`: Berkeley Yacc, as `yacc` and `byacc`.
- `flex`: flex 2.5.4 as Thomas Dickey maintains it (reflex), which starts no m4, also as `lex`, with libfl and the `yacc` package.
- `wabt`: the WebAssembly Binary Toolkit: `wat2wasm`, `wasm2wat`, `wasm-objdump`, `wasm-strip` and `wasm-validate`.
- `binaryen`: Binaryen's `wasm-opt`, for its function-pointer cast emulation (`--fpcast-emu`).
- `meson`: Meson, with the `python`, `cc` and `ninja` packages it runs on.
- `toybox`: toybox's `grep` and `sed`, which have `grep -r` and `sed -i`, in place of the image's.
- `dte`: dte, a small full-screen editor with the keys of a desktop one.
- `mandoc`: mandoc, which formats a manual page of man or mdoc macros as text.
- `tools-build`: A build stage: `cmake-build` with mandoc, what these packages are built on.
- `tar`: sbase's `tar`, which writes archives and reads links and pax headers, in place of the one that only unpacks.
- `sbase`: the sbase commands the image leaves out: `yes`, `cal`, `sha1sum`, `sha512sum`, `sponge`, `cols`, `uuencode` and `uudecode`.

`man` prints a page of text (`/usr/share/man/cat1`) as it is and has no
formatter, so a package formats its upstream page when it is built:
`text-page` in `tools-build` runs mandoc and takes the overstrikes out. A
package with a page is built `FROM tools-build` and keeps none of it, so
mandoc is no row of the package and nothing installs it for a page.

What the platform decides ([process model](../../docs/process-model.md)):

- The compressors and SQLite run on one thread: a `-pthread` program needs
  `threads@0`, and so would every program that links such a library.
- `sqlite3` holds a database's lock while it has the database open
  (`SQLITE_DEFAULT_LOCKING_MODE=1`), so a second process is told `database is
  locked`. A write-ahead log needs memory two processes share and a mapping
  is a private copy; in this mode its index is on the heap. SQLite loads no
  extension.
- `sqlite3` is built with linenoise and `dc` edits its lines as `bc` does,
  from before the terminal edited a line itself. `vi` reads Enter through a
  few lines the recipe adds, a change to an upstream source with its reason
  there: Neatvi reads unedited and leaves Enter's mapping to the terminal.
- Dolly's `tar` reads files and directories. An archive with a pax header
  (every `git archive`) or links is staged as a plain tar of the files a
  build reads ([`prepare-sources.sh`](prepare-sources.sh)); `sqlite`, `xz`,
  `bzip2`, `pigz`, `zip`, `unzip`, `yacc`, `flex` and `mandoc` build from the
  archive as published.
- `fork` fails: `vi`'s `!` commands and language servers, and `tar`'s `-z`,
  `-j` and `-J`, which start the compressor that way, say so. Pipe an
  archive through `pigz`, `bzip2`, `xz` or `zstd`.
- `/bin` comes before `/usr/bin`, so `tar` installs over the core's
  `/bin/tar`, and `toybox` over `/bin/grep` and `/bin/sed` of `posix` with
  links to its one program; no other package here replaces a command.
- toybox's headers (its configuration, option flags and help) are written by
  its own bash scripts and three generators compiled for the host:
  [`prepare-toybox.sh`](prepare-toybox.sh) runs them outside Dolly for `grep`
  and `sed` alone, and the recipe compiles the C. It is the one build step of
  this demo that does not run in Dolly. The recipe takes three `#error`
  lines out of the source and says why.
- There are no process groups, and `dte` asks `tcgetpgrp` whether a stream
  is the terminal: its recipe changes that line to `isatty`.

Test: the `amy tools` case of [`test/amy-browser.mjs`](../../test/amy-browser.mjs)
installs each into `default`, uses it, links a program with each library and
types at the terminal into `sqlite3`, `dc`, `vi` and `dte`; `amy meson alone`
builds a project in a session that had no compiler.
