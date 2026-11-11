# patch in a subdirectory of a git checkout patches nothing

- STATUS: OPEN
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
