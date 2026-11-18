# git commit without -m fails in default: the git package brings no editor

- STATUS: CLOSED
- PRIORITY: 110
- TAGS: audit,recipes,amy,git,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`): every package `amy` offers installed alone into a fresh `default` session.

## State (2026-11-17)

Fixed on `ws/recipes` (0fbea6cd6): `Dollyfile-vi` is a core package and `Dollyfile-git` installs it,
so `git commit`, `rebase -i`, `tag -a` and `merge` find Git's default editor. The task's plan,
Neatvi `FROM system-tools`, would be a cycle: `system-tools` installs `git`, which would install
`vi`, built on `system-tools`. So `vi` is built where `git` is, `FROM system-build`, with what that
base lacks done without it: `gzip` is a `USE` row (the archive is upstream's `.tar.gz`, staged by
the core now, `dist/static/default/neatvi-20.tar.gz`), `ex` is `/usr/bin/ex`, a Slop launcher of
`vi -e` (Neatvi's own ex mode, the one its name selects) where `ln -s` made a link, the licence is
written out of `vi.c` by `ex` itself (`2,16w`, the same 15 lines as `sed -n 2,16p`, compared on
the host), and the build's check compares with `cat`. Once git installs vi, the core's man test
meets it: Neatvi has no `--help`, so `vi.1` begins with a title as upstream's pages do, and `ex`
has the same page. Its README line moved to `README.md`; the tools demo keeps nothing of it.
`system-tools` and every image that installs `git` now hold `vi` (0.3 MB).

Built in `work/recipes` (vi 293,747 bytes, git, system-tools, posix, default, system, less). In a
fresh `default` session, Chromium and Firefox (`work/audit-1116-evidence/recipes/ws-recipes/logs/phase2/`):

- `amy install git` alone says "/v0.1.7/Dollyfile-git installs /v0.1.7/Dollyfile-vi first" and
  "vi installed: 5 files"; `vi` and `ex` are on `PATH`, `ex -s` edits a file, and the licence is
  Neatvi's (case `git-editor`, `cases3-*.jsonl`).
- `git commit --allow-empty` in a new repository opens vi; the message typed there (`ifrom vi`,
  Escape, `:wq`) is the commit's (`git-vi-check.mjs`, `b-git-vi.log`).
- `test/man-browser.mjs`, which installs git and checks every command's page, and
  `test/pager-browser.mjs` (git and less) passed (`b-man.log`, `b-pager.log`), as did the "amy
  tools" vi session (`b-tools.log`).

Rebuilds vi, git, system-tools and everything built on it: the catalog (the 0.1.8 round).

## Found

`default` holds no editor, and `Dollyfile-git` installs none (it `USE`s zlib and curl only):

```
$ amy install git
$ git commit --allow-empty
error: cannot spawn vi: No such file or directory
error: unable to start editor 'vi'
Please supply the message using either -m or -F option.
$ git help log
man: no manual entry for git-log
```

`git commit`, `git commit --amend`, `git rebase -i`, `git tag -a` and `git merge` (its message)
start the editor; Git's fallback is `vi`, which the `vi` package provides (0.4 MB). Agents pass
`-m` and are not affected; a person at the terminal is. The recipe handles the pager this way
already (`Dollyfile-git:46-47,81`: `DEFAULT_PAGER` is `less` when installed, `cat` otherwise); for
the editor there is nothing to fall back to. Git's manual pages are not shipped either.

Evidence: `work/audit-1116-evidence/recipes/debug3.jsonl` (case `git-runtime`).

## Do

`git` is a core package and the core never depends on `demos/` (AGENTS.md), so it cannot install
`demos/tools/Dollyfile-vi`. Neatvi builds `FROM Dollyfile-system-tools` with nothing from its demo,
as `Dollyfile-less` does at the top level: move `Dollyfile-vi` to the top level (its README line to
`README.md`, the staging of `dist/static/tools/neatvi-20.tar.gz` from the tools demo's hook to the
core's) and `INSTALL` it from `Dollyfile-git`. The manual pages stay out unless asked for.

## Done when

In a fresh `default` session `amy install git` alone, then `git commit --allow-empty` opens `vi`.

## Closed (2026-11-17)

The Done-when holds on `ws/recipes`'s build, as the State says: in a fresh `default` session `amy
install git` alone, then `git commit --allow-empty` opens `vi`, in Chromium and Firefox. The 0.1.8
round rebuilds vi and git with the catalog.
