# stack-wrap's programs need stack@0, which the package does not declare

- STATUS: OPEN
- PRIORITY: 190
- TAGS: audit,recipes,amy,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`): every package `amy` offers installed alone into a fresh `default` session.

## State (2026-11-16)

Reproduced in Chrome and Playwright's Firefox on `work/round1113/dist/` (Firefox: `ff-a.jsonl`, `ff-b.jsonl`). Nothing changed yet: one line, which rebuilds
stack-wrap and lean-stage0's chain.

## Found

Every program `stack-wrap` rewrites records `stack@0` (`Dollyfile-stack-wrap:5-7`, its manual:
"The program then records stack@0"). The package declares only `runtime@0`. `docs/dollyfile.md`
(Host requirements): "A package also declares the modules its programs need, a library or compiler
those every program built with it needs (`sdl2`: ...; `rust`: `dso@0` and `threads@0`)", and
`amy` has `nena` enable what a package declares. So in `default`, which declares `nena@0` and not
`stack@0`:

```
$ amy install stack-wrap cc
$ cc -O2 /tmp/fold.c -o /tmp/plain && stack-wrap /tmp/plain -o /tmp/deep && /tmp/deep
dolly: process 118 was refused: host module stack@0 is not enabled: nena enable stack
$ nena enable stack && /tmp/deep        # status 0; /tmp/plain: Maximum call stack size exceeded
```

`amy install` said nothing of `stack@0`, as it does for rust's and sdl2's modules. The one recipe
that installs stack-wrap, `demos/lean/Dollyfile-lean-stage0`, already declares `stack@0`.

Evidence: `work/audit-1116-evidence/recipes/debug3.jsonl` (case `stack-wrap-fold`), `run-b.jsonl`
(case `stack-wrap`).

## Do

`Dollyfile-stack-wrap`: `REQUIRES HOST stack@0` after `runtime@0`.

## Done when

In a fresh `default` session `amy install stack-wrap` says nena enables `stack@0`, and a program it
rewrote runs without a `nena` command; `stack-browser` passes.
