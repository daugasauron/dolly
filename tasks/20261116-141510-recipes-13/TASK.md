# git commit without -m fails in default: the git package brings no editor

- STATUS: OPEN
- PRIORITY: 110
- TAGS: audit,recipes,amy,git,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`): every package `amy` offers installed alone into a fresh `default` session.

## State (2026-11-16)

Reproduced in Chrome on `work/round1113/dist/`. Nothing changed yet.

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
