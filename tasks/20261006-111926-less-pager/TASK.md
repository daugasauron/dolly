# Add less: a pager for long output, and for man

- STATUS: OPEN
- PRIORITY: 335
- TAGS: userspace,commands,agent-experience

Owner (2026-10-06): "A small thing I've noticed before is that it would be
nice to have less, I guess this is important for man as well? Just take note
in a task."

Owner (2026-10-08), from a session on the default image: `git log` and
`git log -n3` at the terminal fail with "error: cannot spawn less: No such
file or directory / fatal: unable to execute pager 'less'", status 128; `env`
has no `PAGER`. "I want less to be installable by amy. git log stuff should
work." In release 0.1.0 (`20261007-133708-v010`), on `core/less-pager`.

So two things, both required:

- Git must work at a terminal without a pager installed (`git log`,
  `git diff`, `git show`, `git branch` and whatever else pages): print
  straight through. With `less` installed it pages. The tests missed this
  because they capture git's output, and git pages only to a terminal: the
  test for it must run git at the real terminal.
- `amy install less`.

There is no pager in the images: long output scrolls past, and `man`
(`20261005-220754-man-help`, in progress on `work/man-help`) would print a
whole page at once.

## Work

- Check first what exists: whether any image ships `more` or another pager,
  and what the terminal's own scrollback already gives a person.
- Prefer upstream `less` built unchanged. Measure what it needs from the
  platform (a terminal description: termcap or terminfo, raw mode, window
  size and resize, reading keys from the terminal while the data comes from a
  pipe) and what Dolly's terminal already provides to Neovim and Emacs; a gap
  is fixed in the platform or reported, not patched around in `less`.
- Where it lives: a package (`amy install less`), and whether `default`
  installs it; its licence row in `config/upstreams.json`.
- `man` and other tools use `$PAGER` when it is set and the output is a
  terminal, and print plainly otherwise (an agent's tool call is not a
  terminal: paging there must never wait for a key).

## Done when

- `less FILE`, `COMMAND | less` and `man NAME` page in the terminal with
  search and quit, shown by a browser test; the same commands print straight
  through when the output is not a terminal.

## Reproduced (2026-10-08, `default` of image inputs `503e6ffe…`, Chromium)

`amy install git`, then at the terminal: `git diff`, `git branch` and
`git help -a` end with status 128 and "cannot spawn less"; `git log` and
`git show` do the same in a repository that has a commit. `git log | cat`,
`git --no-pager log` and `PAGER=cat git log` work. The cause: Git's built-in
pager is `less`, Git 2.55 dies when its pager cannot start (`setup_pager` in
`pager.c`), and Dolly's `start_command` reports `ENOENT` for it.
`build/less-evidence/repro-before-chromium.log`.

## How Git finds its pager

Git's own order is unchanged: `GIT_PAGER`, `core.pager` (and `pager.CMD`),
`PAGER`, then the built-in default. Only the default changes, by one build
flag in `Dollyfile-system-tools`:

    -DDEFAULT_PAGER="$(command -v less || command -v cat)"

A pager with shell characters is run by Git through `SHELL_PATH -c`, which is
Slop; `command -v` is Slop's own, so the line costs one Slop process and
names `less` when it is on `PATH` and `cat` otherwise. Nothing is installed,
exported or configured for it, it holds the moment `amy install less`
returns, and an argument Git appends (`git grep -O`) still reaches the
program. Measured at the terminal of `system` (Chromium, 40 commits):
`git log` through the line and `cat` 30 ms, `git --no-pager log` 30 ms.

Rejected:

- `PAGER` in the default environment (a `cat` exported by `core` or `git`, a
  `less` exported by the package): an installed variable reaches a session
  only when it is next loaded, so `git log` would start paging after a
  reload, and a session that unsets `PAGER` is back at the failure. It is
  also the silent assumption the tests are told not to make.
- A system `gitconfig` with `core.pager`: it outranks `PAGER`, so it would
  make Git wrong for a person who sets `PAGER`; and the `git` package holds
  no `/etc/gitconfig`.
- `-DDEFAULT_PAGER=cat`: Git would never page, less installed or not,
  without one of the two above.
- Changing `pager.c` to print when the pager cannot start, as Git did before
  2.47: a source patch against a decision upstream took on purpose.
- A `pager` command that picks the program (Debian's way): a command, a page
  and an export for what one build flag says.

## man

`man` (in `Dollyfile-system-build`) printed every page whole. At a terminal it
now gives the page to `$PAGER`, a shell command as POSIX has it, and without
one to the line Git runs, with Git's `LESS=FRX` unless `LESS` is set: a page
that fits the screen prints and returns, a longer one is held, and what was
read stays on the screen after `q`. Output that is not a terminal is copied
as before. This replaces the note in `20261005-220754-man-help` that the
package would export `PAGER`: an exported variable reaches a session only at
its next load, so paging would start after a reload.

## The package

- `Dollyfile-less`: less 692 and GNU termcap 1.3.1, from upstream's release
  archives as published (`SOURCE` pins are upstream's SHA-256), built inside
  Dolly `FROM system-tools`. Slop does not run `configure`, so the recipe's
  Makefile states what it would find (a `HAVE` list of 46 names) and writes
  `defines.h` as `config.status` does, by dropping the `#undef` lines. Not
  claimed: `fchmod` (no permission bits) and `ttyname`. It installs
  `/usr/bin/less`, `/usr/libexec/lessecho` (less runs it to expand a name
  typed at `:e`), the page `man1/less.1` as upstream ships it, less's
  `LICENSE` and termcap's `COPYING`.
- **692, not 710.** From 701 on ("don't init terminal if stdout is not tty")
  less looks up its keys with `tgetstr` without having called `tgetent` when
  its output is not a terminal. ncurses answers that; GNU termcap 1.3.1
  dereferences its null entry. Built natively, 710 with termcap 1.3.1 ends
  with SIGSEGV at `seq 1 5 | less | head` and `less --help > file`, in
  `tgetstr` under `special_key_str` (`build/less-evidence/native/`): the
  tool-call path. 692 is the newest release before that change. Worth a
  report to gwsw/less; not made from here.
- **A termcap library is the gap.** The platform has no terminal description
  library: Neovim compiles its entries in, Emacs carries its own `termcap.c`
  and installed `/etc/termcap`. less needs `tgetent`, `tgetstr`, `tgetnum`,
  `tgetflag`, `tgoto` and `tputs` to link (its `--without-termlib` only skips
  the check). GNU termcap is that library as an upstream, built unchanged
  and linked into less; it is not exported, since nothing else asks for it.
- **`/etc/termcap` belongs to the terminal.** The entry moved from the Emacs
  recipe to `Dollyfile-display`, byte for byte plus `@7=\EOF`: without the
  End key in it, less reads End's `ESC O F` as its `F` command and waits for
  the file to grow. The Emacs recipe lost its copy; **Emacs was not rebuilt
  here** (it reads the same path, and every image with a terminal installs
  `display`).
- Licence: less is used under its own two-clause licence; termcap is
  GPL-2.0-or-later, so the program is a GPL one, and the site serves both
  archives with the recipe (`config/upstreams.json`, `docs/licences.md`).
- `default` does not install it: the owner's choice.

## What less needed of the platform (measured in a `system` session, Chromium)

Built there with the recipe's Makefile in 6.5 s (`make -j4`).

- Works unchanged: `/dev/tty` for keys while the data comes from a pipe, raw
  mode through termios, `TIOCGWINSZ`, `poll` on the terminal and a pipe,
  `popen` and `system` through Slop (`!`, `|`, `:e` with `lessecho`), UTF-8
  text, the alternate screen, arrows, Page Up and Down, Home and End (with the
  `@7` above), search, `LESS=FRX`.
- **Gap: a signal handler that leaves by `longjmp`.** less's SIGINT and
  SIGWINCH handlers jump out of the `read` it is waiting in (`intio` in
  `os.c`, `sigsetjmp` and `siglongjmp`, which libc's `setjmp.h` defines as
  `setjmp` and `longjmp`). In Dolly the handler runs inside libc's system-call
  wrapper, which tells the kernel the handler finished only after it returns
  (`DOLLY_PROCESS_SIGNAL_ACKNOWLEDGE` in `dolly_process_call`,
  `src/process/signal.c`). A handler that jumps away never says so: the
  kernel's `handling_signal` stays set, no later signal is delivered to that
  process, and the supervisor's 500 ms timer ends it at the next SIGINT.
  Measured:
  - the first resize of the window repaints less at the new size; a second
    one does not (less keeps the old height until it is restarted);
  - Ctrl+C in less ends less 0.5 s later with status 130 instead of only
    stopping what it was doing. Under Git and man nothing is left behind
    (`LESS=FRX` uses no alternate screen); after a plain `less FILE` the
    prompt comes back on the alternate screen, until a program that leaves it
    properly has run.
  Task `20261008-002251-handler-longjmp`. Not changed here: it is the signal contract ("a process that does not
  finish a delivered signal within 500 ms is terminated"), and the fix is in
  the seed. Two ways: libc acknowledges before it runs the handler, which
  ends the 500 ms rule for a handler that never returns; or `siglongjmp`
  becomes a libc function that restores the mask and acknowledges, with
  `sigsetjmp` saving the mask (musl's `jmp_buf` has the fields), which keeps
  the rule and needs the staged `setjmp.h` changed.
- Not a gap, but seen: forced termination does not restore the terminal
  (alternate screen, modes), for any full-screen program.

## Tests

`test/pager-browser.mjs`, in the core suite, on `default`: every command is
typed at the terminal and none is captured. Without less: `git log`,
`git log -n3`, `git diff`, `git show`, `git branch`, `git help -a` and `man`
of a 300-line page print to their last line with status 0, and `PAGER`,
`GIT_PAGER` and `LESS` are unset. After `amy install less`: `git log`,
`git diff`, `man` and `seq | less` hold the screen at their first lines, Space
moves on, `q` returns with status 0; what fits the screen is not held;
`less FILE` goes forward, back, to a search and repaints in a smaller window;
`PAGER=cat`, `GIT_PAGER=cat` and `core.pager=cat` end without a key; and
piped or redirected, Git, man and less wait for nothing.

## Built and run (2026-10-08, `core/less-pager`, image inputs unchanged)

- Chain: `DOLLY_IMAGE_JOBS=1 DOLLY_BUILD_IMAGES=default,system,git,amy,cc,less,dolly-docs`,
  17 images in 860.7 s once the slot was free (`zig-build` about 8.5 minutes
  of it; the wait for the slot was 26 minutes); the `git` package again,
  alone, in 4.2 s. `build/less-evidence/image-build-1.log`, `-2.log`.
- `test/pager-browser.mjs` passes in Chromium (7.7 s) and Firefox (9.2 s).
  With `amy install less` taken out of a copy it fails at "the terminal
  never showed the first page of git log": the check tells paging from
  printing.
- Also on the rebuilt images, each in both browsers: `man`, `docs`, `core`,
  `terminal`, `shell`, `shell-env`, `slop`, `process`, `display`, `ending`
  pass. `default` stops in Chromium at "the text names cc,git,python":
  `python` is not built in this chain, so the index does not publish it; the
  rest of that test did not run here. Source suite 336 of 336, demo source
  tests 82 of 82, lint 77 recipes.
- The screens of every step, both browsers: `build/less-evidence/tour-*.log`.
- Sizes: the `less` snapshot is 769,018 bytes; `amy install less` adds 5
  files, 532,577 bytes, in 0.2 s (`less` 369,952, `lessecho` 32,440, the page
  110,922, the two licence texts 19,263). `default` is 14,362,052 bytes (13,495 more
  than before: the termcap entry and the larger `man`); with less installed
  by its recipe it would hold those 532,577 bytes more, 3.7%.

## Found on the way and fixed

- The `git` package did not hold `/etc/gitconfig`, where `system-tools`
  turns automatic maintenance off because it forks: in `default`, after
  `amy install git`, every commit printed "fatal: fork failed: Function not
  implemented" with status 0. `Dollyfile-git` keeps the file now, and the
  pager test's sixty commits must be silent.

## What the round must rebuild

Every image: `Dollyfile-system-build` changed (`man`), and with it the pin of
every recipe. No seed change: `npm run build:runtime` is not needed for this
branch. Changed recipes: `system-build`, `system-tools` (Git's default
pager), `display` (`/etc/termcap`), `git` (`/etc/gitconfig`), `dolly-docs`
(`slop.md`, `display.md`), `emacs` (its termcap entry removed), and the new
`less`, which is in both published catalogs. To run that this chain could
not: `npm run test:demos -- emacs`, `test/default-browser.mjs` and
`test/amy-browser.mjs` with `python` built, `test/dolly.artifacts.mjs`.

## Left (why this stays open)

- A second resize of the window while less is open, and Ctrl+C in less:
  `20261008-002251-handler-longjmp`, a fix in the seed. The test resizes once.
- `git help COMMAND` and `git COMMAND --help` still end with status 128
  ("failed to exec 'man'", "no man viewer handled the request"), with or
  without less: Git execs `man`, Dolly has no exec
  (`20261006-214244-process-exec`), and Git's own pages are AsciiDoc that no
  image renders. `git help`, `git help -a` and `git COMMAND -h` work.
- Emacs was not rebuilt with the entry in `display`.
- `man less` and the other upstream pages are roff source until pages are
  rendered at build time (`20261005-220754-man-help`).
- less 710 with GNU termcap: the crash is worth reporting to gwsw/less.
- The owner's choice: whether `default` installs less.
