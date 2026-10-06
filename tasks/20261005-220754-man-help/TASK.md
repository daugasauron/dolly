# Add man and make every shell command explain itself

- STATUS: OPEN
- PRIORITY: 235
- TAGS: core,commands,docs,agent-experience


Owner request (2026-10-06): "I want to add the man command, and make sure
things in general in the shell has good man/help."

## Today (main `4f8a2309`)

- There is no `man`. `help` (a core command in `Dollyfile-system-build`)
  prints one page about Slop: builtins, expansions, options.
- `--help` is uneven: the in-house commands answer it (35 `"--help"` branches
  across the core recipes, `src/commands/` and `src/slop.c`); sbase commands
  print a usage line only on a wrong invocation; sbase ships a `.1` page per
  command that the image does not retain; Git, Make, curl and awk carry their
  own help of very different depth.
- Packages bring commands with no shared help convention (`rg --help` is long,
  `amy` prints four lines).

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
- **Packages**: a page is a `FILE /usr/share/man/…` row beside the command's
  export; no new mechanism (`core`, `cc`, `amy`, `curl`, `gzip`, `ripgrep`).
  Toolchains keep the directory with one `FOLDER /usr/share/man` row placed
  after their last page: the engine lists a folder's members when the row
  runs (`collect_paths` in `dollyfile.c`), not when the recipe finishes.
- **Summaries**: a package's sentence is its README line (amy,
  `20261005-220754-amy-descriptions`); a command's is its page. `help` does
  not list commands with summaries yet: Dolly's `--help` texts start with the
  usage line and have no summary line to list.

## Implemented, not built

- `man` (inline in `Dollyfile-system-build`, exported by `core`): status 1
  and `man: no manual entry for NAME` for a missing page, 2 and the usage
  line for a wrong invocation.
- Page capture in `system-build`, `system-tools`, `system`, `curl`, `gzip`,
  `ripgrep`; sbase's pages staged (`prepare-image-sources.sh`) and moved by
  the same `TOOLS` list that builds the commands; `awk.1`, `samu.1`; Make's
  page is `make --help`.
- `--help` added to `xargs`, `nproc`, `session-recover`; `xargs` and `help`
  exit 2 with the usage line on a wrong invocation; `help` names `man` and
  no longer prints `PATH`, so its page is the same text wherever it is read.
- Checked natively: `test/commands.test.mjs` builds 30 of the commands
  (`man` among them) and checks `--help` and the statuses (8 of 8 pass); 15
  inline commands and `tar` were also run through the capture loop under gcc
  (5,011 bytes with the `test` pages); the `test` page was checked against
  `test.c`;
  `npm run lint:dollyfiles` passes for 61 recipes; the source suite passes
  257 of 261, the four failures being `dist/*.mjs` modules this source-only
  checkout does not have; the demo source tests pass 83 of 83.
- `sbase.tar` is re-pinned from a tar built in `build/man-evidence/` (the
  old glob reproduces the old pin, so the builder is deterministic; the new
  tar holds sbase's 99 pages, of which the 44 built tools' are kept). The
  `SOURCE` pin of `awk.tar` is stale until staging runs (`npm run image`
  refreshes it). The loops' shell syntax was run in a native Slop.

## To run when the catalog is built (integrator)

Each inside the brief's memory-capped scope, one at a time, in a full
worktree (`work/round2`'s `emacs-*.tar.gz` and `pi-source-d78dc83…`
hard-linked into its `.cache`):

    bash work/setup-worktree.sh man2 work/man-help-verify work/man-help work/round2
    npm run build:runtime            # system-build's recipe changed: every image re-pins and rebuilds
    DOLLY_IMAGE_JOBS=1 DOLLY_BUILD_IMAGES=default,ripgrep work/build-slot.sh npm run image
    unset DISPLAY
    node test/man-browser.mjs chromium && node test/man-browser.mjs firefox
    node --test 'test/*.test.mjs'
    for suite in core shell slop; do node test/$suite-browser.mjs chromium && node test/$suite-browser.mjs firefox; done

Steps most likely to fail, each a one-line recipe row: `ld --help`,
`make --help` and `git --help` (status read from the source, never run) and
the `cp` of `/tmp/ninja/source/samu.1`.

## Left

- Render upstream pages at build time (mandoc in `system-tools`).
- One line per option and an example in each `--help` (only `man`, `xargs`,
  `nproc`, `session-recover` and `test` follow it); a wrong invocation still
  prints a message instead of the usage line in most (`download`, `pwd`, `cd`, …).
- `help` listing the commands with summaries.
- Pages for the other packages (`fd`, `python`, `nvim`, …); image growth
  measured in a built image.

## Merged branch `integrate/userspace-next` (2026-10-06, not built)

`work/man-help`, then `work/small-default` (with `work/amy-index`),
`core/self-description` and `core/concurrent-pipelines`, which merged
without a conflict outside recipe pins. Resolved by hand: `Dollyfile-minimal`
(removed, as small-default does), the `nproc.c` and `amy.c` pins of
`Dollyfile-system-tools`, and the package paragraph of `docs/dollyfile.md`.
Added for the merge:

- Page rows: 59 in `Dollyfile-posix` (45 upstream pages in `man1`, 14 in
  `cat1`), 3 in `Dollyfile-git`. `sh`'s page is a copy of Slop's, not a link:
  `posix` cannot rely on a file of `core`. The start-up text names `man`.
- `help` is one text of nine lines: commands and `man`, the documents
  directory (`amy install dolly-docs` where it is absent), what Slop lacks,
  pipelines and `&` as `20260930-100000-audit-32` words them, no permission
  bits or `chmod`, the limits, status 126. The language table is gone from it:
  `docs/slop.md` is the one description (`20261005-133403-self-description`).
  The Pi skill and `docs/slop.md` no longer say `help` prints the syntax.
- Six document pins of `Dollyfile-dolly-docs` refreshed: the merge changed
  the documents it ships.

Checked, each in a 2G scope: `npm run -s lint:dollyfiles` (63 recipes, each
with `REQUIRES HOST runtime@0`); `node --test 'test/*.test.mjs'` 272 of 276,
failing only for the missing `dist/` modules (`image-build-service`,
`process-abi`, `system-snapshot-format`, `terminal-ring`); demo source tests
83 of 83; the task files of the merged branches are byte for byte theirs.

To verify, in order, in a full worktree of this branch, one capped scope at a
time (this replaces the list above):

    npm run build:runtime          # seed: slop.c, the libc adapter, amy.c, system-build; runs pipe-driver
    node --test 'test/*.test.mjs' 'demos/**/*.test.mjs'      # now with dist/: all pass
    DOLLY_IMAGE_JOBS=1 DOLLY_BUILD_IMAGES=default,system,cc,git,ripgrep,dolly-docs,pi work/build-slot.sh npm run image
    unset DISPLAY
    for suite in man default amy docs core shell slop; do node test/$suite-browser.mjs chromium && node test/$suite-browser.mjs firefox; done
    npm run test:demos -- pi
    npm run image -- pi --plan     # after a one-word edit of docs/slop.md (self-description's done-when)

Likeliest failures, first to last:

1. `system-build`: the `--help` capture loop (`ld`, `make` and the compiler
   drivers were read, never run) stops the build at the command that fails.
2. `system-tools`: `mv $(TOOLS:=.1)` when `sbase.tar` is staged without pages
   (its pin was computed here, not by staging); `git --help`; the copy of
   `samu.1`; the `awk.tar` pin, stale until staging refreshes it.
3. `posix`, `git`, `core`, `cc`, `amy`: a `FILE` row naming a page its
   toolchain did not write fails by name.
4. `pi-coding-agent`: the skill's pin, refreshed by staging.
5. `test/man-browser.mjs` has never run; it assumes every file in `/bin` and
   `/usr/bin` of `default` is a command with a page.
6. Recipes that pipe (`gzip -dc A | tar -xf -`) now run both programs at once
   (`20260930-100000-audit-32`, "Recipes").
