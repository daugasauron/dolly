# man and --help: upstream pages print as roff source, and 17 packages have no page

- STATUS: OPEN
- PRIORITY: 100
- TAGS: core,commands,docs,agent-experience

## State (2026-10-13)

Owner (2026-10-06): "I want to add the man command, and make sure things in general in the shell
has good man/help."

Shipped in v0.1.0, and the done-when holds: `man` with a page for every command of `default`,
`--help` on Dolly's own commands, pages that arrive with `amy install`, and
`test/man-browser.mjs` in Chromium and Firefox ("Built and run", below); at a terminal `man`
pages through `$PAGER` or `less` (`f3f641cb`).

Done on 2026-10-13:

- **`help` fits 80 columns.** The greeting sends a newcomer to `help`, whose lines were up to
  200 characters and broke inside words at the page's width. The same words on lines of at
  most 78 characters, held by `test/man-browser.mjs`: the commit "help fits a terminal of 80
  columns" on the branch `core/site-polish-help`, apart from the rest of that day's work
  because it is an image input (`Dollyfile-system-build`, every recipe repinned). Built on the chain of `default`, `cc`,
  `git` and `less` (15 images, 888 s); `man`, `pager` and `shell-env` tests passed there in
  Chromium and Firefox. It is done when that commit is on `main`.
- **`llms.txt` says how a page is driven** (`d9402889`): the terminal is a canvas and is read
  from a screenshot, `data-dolly-status` on the `html` element says `loading`, `ready`,
  `built`, `failed` or `exited`, and typed keys reach the shell once it is `ready`
  (`test/site-browser.mjs` types into a page that has no focused element). Whether part of
  `window.__dolly` becomes a documented interface stays with step 3 of
  `tasks/20260930-100000-audit-24`.

Left, in the order of what a newcomer meets:

1. **45 upstream pages print as mdoc or man source**: `man grep`, the example `man man` gives,
   starts with `.Dd October 8, 2015`. Rendering them when `system-tools` is built needs mandoc
   there (119 C files, a hand-written `./configure`; "Decisions", below): a port with a new
   source, pin and licence row, and a change of the seed.
2. **17 packages bring commands without a page** (read from the recipes on 2026-10-13: the
   packages with an `EXPORTS TOOL` and no row under `/usr/share/man`): `cargo`, `cbindgen`,
   `cmake`, `codex-cli`, `emacs`, `fd`, `javascript`, `llvm`, `lua`, `mojo-compiler`, `nvim`,
   `pi-coding-agent`, `protox`, `python`, `rust`, `transcribe`, `voice`. A page is one `FILE`
   row beside the export, as in `Dollyfile-zig`; the check belongs in each package's row of
   `test/amy-browser.mjs`.
3. **`amy install` says "its environment applies when the session is next loaded" after every
   package**, also one that exports no variable (`less`, `make`), and nothing between
   "fetching" and the end of a large install. `src/commands/amy.c` was the packages work's file on 2026-10-13; said to
   the integrator that day.

Decided on 2026-10-13, and not planned:

- `help` does not list the commands with summaries. `ls /bin /usr/bin` lists them and `man NAME`
  describes each; `help` is the list of what differs from a POSIX shell, and a summary line
  per command would be a second text to keep beside the pages.
- Slop's builtins take no `--help`: `cd --help` is "No such file or directory". `man cd`,
  `man command` and `man time` answer with the usage line of the programs of the same name, and
  `docs/slop.md` lists the builtins.
- An in-house `--help` is its usage line, with a line per option where the command has options
  worth a line (`xargs`, `curl`, `cc`). A wrong invocation exits 2 with a message that names
  what was wrong (`ls -Z`: "unsupported option: -Z"), which says more than the usage line.

## Expected

- `man NAME` works for every command on `PATH` in `default`, from retained
  pages: upstream pages where they exist (sbase's `.1` files unchanged), short
  in-house pages for Dolly's own commands (`amy`, `download`, `upload`,
  `foreground`, `dollyfile`, `session-recover`, Slop itself). Decide the
  renderer by measuring: a small `man` over plain pages, or an upstream
  formatter if one builds unchanged and is small.
- One convention for in-house commands: `NAME --help` exits 0 and prints
  usage, one line per option and an example; a wrong invocation prints the
  usage line to stderr and exits 2. `help` points at `man` and lists the
  commands with their one-line summaries.
- A package's pages arrive with it: `INSTALL` and `amy install` bring
  `/usr/share/man` entries like any other file
  (`20261005-220754-amy-descriptions`).
- One story with `20261005-133403-self-description`, which ships the
  platform documents under `/usr/share/doc/dolly/` and makes `help` point
  there: `man` covers commands, that directory covers the platform, and
  neither repeats the other. Git already looks in `/usr/share/man`
  (`GIT_MAN_PATH` in `Dollyfile-system-tools`) and finds nothing.

## Done when

- A browser test walks every command on `PATH` in `default` and checks that
  `man NAME` and (for in-house commands) `NAME --help` succeed with non-empty
  output; the same check runs after `amy install` of one package.
- Image growth from retained pages is measured and recorded.

This changes the seed (`system-build`, `system-tools`): batch it with the next
rebuild round.

## Measured (2026-10-06, `work/man-help` on `integrate/seed-1006`, by reading the recipes and pinned sources)

Nothing here was run in an image or a browser: the catalog was rebuilding and
image builds were closed. Native checks are named where they exist.

Inventory: 94 commands on `PATH` in `default` (`EXPORTS TOOL` rows of
`system-build` 25, `system-tools` 66, `gzip`, `curl`, `system` 1); `man` makes 95.

| Origin | Commands | Help before |
| --- | ---: | --- |
| Inline C in the recipes (17 core, `tar`, `download`, `upload`) | 20 | `--help` exits 0 in 18; `test` and `[` cannot (an argument is an expression) |
| `src/commands/` (16 in `system-tools`, `gzip`, `curl`, `session-recover`) | 19 | `--help` in 16; none in `xargs`, `nproc`, `session-recover` |
| `slop`, `sh` (a link), `dollyfile`, `cc` `c++` `ld` `ar` | 7 | `--help` in all |
| sbase | 44 | usage on a wrong invocation only; 44 mdoc pages upstream, 42,379 bytes, none staged |
| Make, awk, Samurai (`ninja`) | 3 | `make.1` 11,853 and `awk.1` 13,062 bytes (man), `samu.1` 5,491 (mdoc), none retained; the prepared Make source holds only the compiled files, so `man make` is `make --help` |
| Git | 1 | `git --help`; its pinned source has AsciiDoc only, no roff page |

`dollyfile-lint` is not in `default`: it belongs to the Studio image.

## Decisions

- **Renderer: none in the image; `man` prints the retained page.** Sizes:
  the 44 sbase pages are 42,379 bytes as source and 47,384 bytes rendered
  (`groff -mdoc -Tascii` on the host); mandoc 1.14.6 is 119 C files,
  48,683 lines, 537,320 bytes stripped on x86-64 (built natively in
  `build/man-evidence/`; wasm64 size not measured), and its build is a
  `./configure` shell script, so it is not "unchanged and small" for
  `default`. Run-time formatting would add about 0.5 MB to hold 0.07 MB of
  pages. Rendering at build time (mandoc in `system-tools` only, text in the
  image) is the target and adds about 5 KB over the sources; it needs an
  image build to port and verify, so it is not done. Until then an upstream
  page prints as its mdoc or man source, unformatted. A subset renderer
  inside `man` was rejected: a second roff to maintain, and `make.1` and
  `awk.1` use other macros.
- **Layout**: `/usr/share/man/cat1/NAME.1` is plain text, `man1/NAME.1` is
  upstream source; `man` reads the first that exists. When pages are
  rendered at build time everything is `cat1` and `man` loses the second path.
- **One source for Dolly's own commands**: the page is what `NAME --help`
  prints, captured by the recipe that builds the command (a step that fails
  the build when `--help` does). `test` and `[` have a written page in the
  recipe. `man slop` is `slop --help` followed by `help`; `sh` links to it.
  Git's page is `git --help`.
- **Pager** (`20261006-111926-less-pager`): `man` pages only when standard
  output is a terminal and `$PAGER` is set, and otherwise prints and exits,
  so a tool call never waits for a key. `$PAGER`, not `less` on `PATH`: it is
  the variable POSIX gives `man`, the pager's package exports it
  (`EXPORTS ENV PAGER less`), a session can unset it, and `man` names no
  program. Not implemented: there is no `exec`, so it is a `posix_spawn` of
  the terminal's foreground program and needs a pager to verify against.
  `man --help` says what holds today.
  Done otherwise on 2026-10-08 (`20261006-111926-less-pager`): `man` runs
  `$PAGER` through Slop, and without it less when it is on `PATH`; the
  package exports nothing, because an exported variable reaches a session
  only at its next load.
- **Packages**: a page is a `FILE /usr/share/man/…` row beside the command's
  export; no new mechanism (`core`, `cc`, `amy`, `curl`, `gzip`, `ripgrep`).
  Toolchains keep the directory with one `FOLDER /usr/share/man` row placed
  after their last page: the engine lists a folder's members when the row
  runs (`collect_paths` in `dollyfile.c`), not when the recipe finishes.
- **Summaries**: a package's sentence is its README line (amy,
  `20261005-220754-amy-descriptions`); a command's is its page. `help` does
  not list commands with summaries yet: Dolly's `--help` texts start with the
  usage line and have no summary line to list.

## Built and run (2026-10-06 night, `integrate/next`, worktree `work/next`)

On the final merge (runtime `dccf70f9…`, image inputs `4431ea80…`), and
before it on the first chain (`e8e495dc…`):

- `test/man-browser.mjs` passes in Chromium and Firefox: every file in `/bin`
  and `/usr/bin` of `default` has a page, every one of Dolly's own answers
  `--help`, a missing page is status 1 with the name on stderr, a wrong
  invocation is status 2 with the usage line, and the same two walks pass
  after `amy install git`. (`git`, not `ripgrep`: ripgrep needs the Rust
  chain, which the catalog round builds; its page rows are unverified.)
- Measured in the built `default` (14,398,305 bytes): 82 commands and 82
  pages, 37 plain (10,299 bytes) and 45 upstream (55,441 bytes: sbase's 44
  and `awk.1`), and a 42,318-byte `/bin/man`: 108,058 bytes, 0.75% of the
  image. `core` went from 1,057,526 to 1,110,126 bytes, Slop's own growth
  from the pipelines work included.
- The first build failed in the capture loop: Slop runs its own `cd` for the
  word `cd`, which takes `--help` as a directory. The loop names `/bin/NAME`
  (`fbfc278b`). None of the steps listed as likely to fail did.
- `sbase.tar`'s pin, computed natively, is the one staging produced.

The done-when holds; what "Expected" asks beyond it is under "State".
