# patch in a subdirectory of a git checkout patches nothing

- STATUS: CLOSED
- PRIORITY: 220
- TAGS: commands,git

`patch` (`src/commands/patch.c`) runs `git apply`. Inside a git repository `git apply` takes
paths from the top of the working tree and skips the ones outside the current directory, so
`patch -p1 -i FILE` in a subdirectory of any checkout exits 0 and changes nothing, where GNU
patch applies relative to the current directory.

Measured 2026-11-11: `test/commands.test.mjs` "diff reports 0/1/2 and patch reads the patch"
passes with `TMPDIR` outside a repository and fails with it inside `~/dev/dolly`
(the file stays `one\ntwo\n`). In Dolly the same happens to a `patch` run inside a cloned
repository's subdirectory.

Done when `patch` applies relative to its directory wherever that lies (for example by keeping
`git apply` from finding an enclosing repository), with the test run inside a checkout too.

## Closed (2026-11-12)

`patch` sets `GIT_CEILING_DIRECTORIES` to its directory's parent, so `git apply` finds no
repository above it and applies relative to it, as GNU patch does (a repository at the directory
itself applies from there anyway). The test's work directory is a repository now: it failed with
the old `patch.c` (the file stayed `one\ntwo\n`) and passes with the new, natively; in Dolly with
the `git` package of the next round.

