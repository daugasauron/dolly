# Slop cannot cd anywhere once its working directory is deleted

- STATUS: OPEN
- PRIORITY: 200
- TAGS: bug,slop,shell



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
