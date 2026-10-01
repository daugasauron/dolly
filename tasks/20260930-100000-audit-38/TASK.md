# Janis silent no-ops and dead shim code

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: bug,janis,demo,cleanup

`chmod` does nothing, `accessSync` ignores its mode, `mkdtemp` is not exclusive,
`createReadStream` ignores `start`/`end`, `fetch` ignores `redirect`, `util.inspect(fn)` returns
undefined, `os` memory/CPU counts are 0. In `dolly-node.js` the timers and stdio objects are
overwritten by `janis.js` (dead). Studio's `lint.mjs` uses qjs `Dolly.*` while `build.mjs` uses
Janis Node APIs.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Unsupported options fail explicitly; dead shim code removed.

## Done when

- Tests for each API; dead code deleted.

## Findings (2026-10-02, fix/janis on `ea1b32e`)

`42a3534` and `4f210be` addressed the list; checking each against Node 22.22 found:

- `chmod` and `access` modes: the process libc has one user and no permission bits
  (`src/process/libc-adapter.c`), so `chmod` checks the path and changes nothing for
  every Dolly program; Janis forwards to it. That is a core decision, not a Janis
  no-op. Janis now validates like Node: `access` modes outside 0..7 throw
  `ERR_OUT_OF_RANGE` (they reached the kernel as `EINVAL`), and a non-octal string
  `chmod` mode throws `ERR_INVALID_ARG_VALUE` (it became mode 0 and succeeded).
- `mkdtemp` is exclusive; its suffix could be shorter than Node's six characters.
- `createReadStream` honoured `start`/`end` but returned an empty stream for
  `start > end` and reported a negative `start` only asynchronously; both throw
  `ERR_OUT_OF_RANGE` now, as in Node. `createWriteStream` ignored
  every flag but `a` (`wx` overwrote) and `start`; flags are honoured and `start`
  fails with `ENOSYS`.
- `util.inspect` printed `[Function: (anonymous)]` and called classes, async
  functions and generators `Function`; it now matches Node for each kind.
- `fetch` `redirect` (`error` fails, `manual` throws), `os` resource queries
  (`ENOSYS`) and the dead `dolly-node.js` timers/stdio were already done; no other
  `dolly-node.js` global is overwritten by `janis.js`.
- Studio `lint.mjs` now uses `process.argv`, `readFileSync` and `process.exit`, and
  `dollyfile-lint` runs it with `janis`; Studio no longer requires `qjs`.

## Evidence

Same Node oracle and Chrome run as [audit-37](../20260930-100000-audit-37/TASK.md);
explicit Dolly-only failures are checked in `janis-files.mjs`. `util.inspect` is
also compared with Node in `janis-compatibility.test.mjs`. The ported `lint.mjs`
printed the same usage, stdin and `ENOENT` diagnostics under Node. The
`dollyfile-studio` image builds only with the install fix from `8736d36` (applied
for the check, not committed); its build ran `dollyfile-lint` on Janis, and the
Studio browser test passed every lint step, then stopped at the Neovim fixture's
`FILE body is not plain text` (line 12), which fails identically with the old qjs
lint because `8736d36` moved the example's `FILE` line. Neovim's `system()` call
returned the lint diagnostic and status 1 in 59 ms. Commit `7af6ff2`.

Left: `Response.redirected` stays false after the broker follows a redirect (the
broker publishes only the final URL); `util.inspect` of non-functions is JSON, not
Node's format; readable streams ignore `pause()` and backpressure.

