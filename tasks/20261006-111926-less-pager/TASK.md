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
