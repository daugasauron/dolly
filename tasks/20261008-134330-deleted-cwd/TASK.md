# Slop cannot cd anywhere once its working directory is deleted

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: bug,slop,shell

## Closed (2026-10-13)

Fixed in `bb040357` (`core/polish`, a seed change: `src/slop.c`). The `cd` builtin asked for the
current directory's name before it changed it and gave up when there was none; a shell started
in a removed directory (`slop -c`, a script) stopped the same way at its first line. `cd` now
takes the old name from `PWD`, as every POSIX shell does, and a shell started there keeps the
`PWD` it was given.

The test: "a shell whose directory was removed can still change directory" in
`test/fixtures/slop-cases.mjs` removes its own directory, starts `slop -c "cd /"` there and
changes back by an absolute path, checking `PWD` and `OLDPWD`. Natively
(`node --test test/slop.test.mjs`, Slop under sanitizers against Bash) it fails before the fix
and passes with it; in the browser `test/slop-browser.mjs` passes in Chromium and Firefox on a
`system` image rebuilt on the seed with the fix.

## The defect

Found on 2026-10-08 in a session of the v0.1.0 catalog (a custom image on
`cmake-build`, Chromium), while bringing the Rust compiler build up.

    dolly:/tmp/r/rust$ rm -rf /tmp/r
    dolly:?$ cd /tmp
    slop: cd: No such file or directory
    slop: getcwd: No such file or directory

Every later `cd`, absolute paths included, fails the same way, and a child
`slop` fails at start with the `getcwd` message. `mkdir -p /tmp/r/rust` does
not bring it back. The kernel is not the cause: in the same session
`python3 -c "import os; os.chdir('/tmp'); print(os.getcwd())"` prints
`/tmp`. So the `cd` builtin asks for the current directory before it changes
it and gives up when that fails.

Done when: after its directory is removed, `cd /absolute/path` works in Slop
(as it does in every POSIX shell) and a core shell test shows it.
