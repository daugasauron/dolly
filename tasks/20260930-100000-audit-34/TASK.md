# dd, patch, diff and timeout diverge from POSIX/GNU behavior

- STATUS: CLOSED
- PRIORITY: 220
- TAGS: bug,commands,core

`dd.c:188`: `seek=` truncates the output file to 0. `patch.c:83`: a positional operand is
treated as the patch file (should be the file to patch). `diff` is `git diff --no-index`: `-r`,
`-q`, `-N` rejected, `-s` means `--no-patch`, output always git-style. `timeout 0` kills
immediately (`timeout.c:210,223`; GNU treats 0 as no timeout).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Standard operand and option semantics, or explicit errors for unsupported options.

## Done when

- Tests: `dd seek=1 conv=notrunc` preserves prefix; `patch FILE < diff` patches FILE; `diff
  -q`/`-r` behave or fail explicitly; `timeout 0 true` succeeds.

## Resolution (2026-10-01)

Fixed in `3c43dca` ("Share command spawning and fix find, xargs, timeout, diff,
patch and curl"); `dd` now comes from sbase, whose `seek=` truncates only
without `conv=notrunc`. `test/core-browser.mjs` checks `dd seek=2
conv=notrunc` keeps the prefix, `dd seek=1` truncates, `timeout 0 sleep 1`
succeeds, `patch FILE < diff` fails explicitly and leaves FILE unchanged while
`patch -p1` applies; `diff` accepts `-q`, `-r` and `-N`.
