# console@0: a terminal the host holds into a session, with a program on it

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: donna,host-modules,terminal,0.1.6

Requested from Donna, the native Rust host of Dolly's userspace (`~/dev/donna`), as its request
6. The owner, there: "something I can connect to, and interact with (maybe needs a new host
bridge in dolly, ssh@0?)"; here (2026-11-11): "sounds good as long as it doesn't interfere too
much with other stuff".

## Why

Without `display@0` a host has no interactive terminal: the terminal's input comes only from
the display's decoder (`host/input/kernel.c`, `fill_terminal_input`), so `/bin/slop` on a
headless host prints and never reads, its size is 0x0, and nothing outside a session can attach
to it.

## Design

`console@0` (`host/console/`): a console is a pseudo-terminal (`host/pty/kernel.c`, through
`host/pty/pty-kernel.h`) whose master end the host holds in place of a process. The contract
(`dolly-console-0.wat`) is kernel exports the host calls on its supervisor's thread: open of a
size, spawn of the supervisor mailbox's packet with the slave as descriptors 0, 1 and 2 (the
packet maps none), write (typing), read (output), resize (SIGWINCH), close (SIGHUP), and a
64 KiB transfer buffer. Everything else is the pseudo-terminal's: the discipline, VINTR under
ISIG sparing the waiting shell, the signals the supervisor delivers. Consoles are among the 32
pseudo-terminals. No process calls it, so it records no executable's identity and changes no
image; `process.h` is unchanged. Transport (SSH, a socket) is the host's.

In the browser an image that declares the module gets `openConsole({ columns, rows, argv })` on
boot()'s handle (`docs/embedding.md`, "A terminal into the session"): what an embedding gives
a socket or a second view, and what Dolly's test drives.

## State (2026-11-11)

On `fix/console`, from `939a9102f` (main before the new seed, so `work/godot`'s images ran
it). `test/console-browser.mjs` passes in Chrome and Firefox: typing and echo, the size
(100x30 by `TIOCGWINSZ`), a resize reaching the program as SIGWINCH (120x40), Ctrl+C ending the
command (status 130) and not the shell, and `exit 3` ending the console with status 3. The pty,
process and core tests pass on the refactored pseudo-terminal code and spawn. Donna ran the same
contract on wasmtime from this branch's `dist/dolly.wasm` (its `tests/console.rs` in `core`:
typing and echo, Ctrl+C, a resize, `exit 3`; `donna serve ... core -- /bin/slop` with `donna
attach` over a Unix socket; `default`'s ENTRY on a console, its recovery shell after `exit`).
Left: the merge, which `work/round-1111-gate2.sh` makes before the round's suites with the docs
image rebuilt (`Dollyfile-dolly-docs` ships the contract), and Donna records the commit.

Done when: the test passes on main's images in both browsers, and Donna's `donna serve` runs a
session through the same contract.

## Closed (2026-11-11)

Done: `311026cc6` and `5e973183d`, merged in `4188c1f33`. On the 0.1.6 compiler round (`work/round-1111d.sh` to `round-1111i.sh`; seed and catalog pinned in `d1cb11dbc` and `6fdcad104`, image inputs `16a63999…`; logs in `build/round-1111-evidence/rerun*`)
`test/console-browser.mjs` "console" passed in Chromium and Firefox. Donna's
`20261111-070653-console` runs it: `cargo test --release` with `tests/console.rs` passed against
`4188c1f33` and again against main `e13355553`.
