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
