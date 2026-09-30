# REFUTED: runtime-worker malloc result compared with 0

- STATUS: CLOSED
- PRIORITY: 50
- TAGS: core

The kernel audit claimed `src/runtime-worker.mjs:192` misses allocation failure because memory64
`_malloc` returns a BigInt.

## Evidence

Established: REFUTED. `dist/dolly.mjs` wraps exports with `makeWrapper_pp = f => a0 =>
Number(f(BigInt(a0)))`, so `_malloc` returns a Number and `=== 0` is correct.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

No change needed.

## Result

- Recorded so the claim is not re-filed.
