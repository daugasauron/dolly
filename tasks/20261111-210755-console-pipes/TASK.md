# console@0's pipes: a program the host starts on three pipes it holds

- STATUS: CLOSED
- PRIORITY: 290
- TAGS: donna,host-modules,0.1.6

Requested from Donna, the native Rust host of Dolly's userspace (`~/dev/donna`), as its request
7: `echo typed | donna run … -- /bin/cat` prints `typed`, and standard error comes out apart,
for CI. A terminal console (`20261111-153644-console`) echoes, turns `\n` into `\r\n`, needs ^D
for end of file and merges standard error into the output.

## Design

`console@0` holds either a terminal or three pipes (`dolly_console_open_pipes`). The root
process's descriptor 0 reads what the host writes until `dolly_console_end_input`; the host reads
1 and 2 apart (`dolly_console_read` takes the descriptor); a write the host no longer reads is
`EPIPE`, for which libc raises `SIGPIPE`, as for a kernel pipe. Each pipe holds 64 KiB, and is a
kind of descriptor as sockets are (`host/console/kernel.c`), FIFO to `fstat`, no terminal. Still
v0: `console@0` is unreleased, and `read` gained its descriptor argument. In the browser,
`openConsole({ pipes: true, argv })` gives `output`, `errors` and `endInput()`.

## State (2026-11-11)

On `fix/console-pipes` from main `03536d0c9`, built in `work/pipes` on main's images (image
inputs `16a63999…`): `test/console-browser.mjs` passes in Chrome and Firefox, the terminal test
and "console pipes" (`cat` gives back what was written byte for byte, `echo err >&2` comes back
apart, `test -t 0` is false, status 4, and a loop of `echo` ends with SIGPIPE, 141, once the host
closes). Donna builds against the contract. Left: the merge after the round, with the docs image
rebuilt, which ships the contract.

Done when: `test/console-browser.mjs` "console pipes" passes in Chrome and Firefox (`cat` byte for
byte, output and error apart, a status, `SIGPIPE` once the host stops reading), the terminal test
still passes, and Donna's `donna run` pipes through it.

## Closed (2026-11-11)

Done: `4acb28faf`, merged in `34178ba6b`. On the 0.1.6 compiler round (`work/round-1111d.sh` to `round-1111i.sh`; seed and catalog pinned in `d1cb11dbc` and `6fdcad104`, image inputs `16a63999…`; logs in `build/round-1111-evidence/rerun*`)
`test/console-browser.mjs` "console pipes" passed in Chromium and Firefox. Donna's
`20261111-044218-site`: `echo typed | donna run --images ... core -- /bin/cat` prints `typed`,
and `cargo test --release` passed whole against main `e13355553`.
