# Mojo: the cross-compiled target test and cross-compile.sh never run; mojo-browser.mjs compiles the same programs in Dolly

- STATUS: CLOSED
- PRIORITY: 120
- TAGS: audit,ports,mojo,cleanup,0.1.8

## State (2026-11-17)

Removed on `ws/recipes` (f66240630), as the smallest fix says. Source only: no image rebuilds.

## What

`demos/mojo/target/test/mojo-target-browser.mjs` (76 lines) runs the fixtures of
`demos/mojo/target/test/fixtures/` as objects that `demos/mojo/target/cross-compile.sh` (18
lines) compiles with a native Mojo compiler built outside Dolly by Bazel ("45 minutes at six
jobs, 10 GB", `demos/mojo/target/README.md:38-57`). No round has that compiler, so the runner
always skips it: `demos/run-browser-tests.mjs:24` names it in `needs`, and the 0.1.7 round
printed `skipped: demos/mojo/target/test/mojo-target-browser.mjs needs the objects of
demos/mojo/target/cross-compile.sh, which a native Mojo compiler writes`
(`work/round1113/build/round-1117-evidence/demos.log`). The audit of 2026-10-12
(`tasks/20261012-230015-audit-fable/hygiene.md:57`) already found it unrun.

Since `bc1502bf3` (2026-10-13) `demos/mojo/test/mojo-browser.mjs` compiles the same fixtures
with the Mojo compiler built inside Dolly and runs them in the `mojo-gpu` image
(`mojo-browser.mjs:2,20`: "it compiles in the session the programs demos/mojo/target
cross-compiles"); it ran in the 0.1.7 round. The target test proves nothing the in-Dolly test
does not, through a compiler built outside the sandbox.

AGENTS.md, Zen: "Never keep/add code that 'might be useful in the future'"; Goal: programs
"built from their upstream sources inside the sandbox itself".

## Smallest fix

Delete `demos/mojo/target/test/mojo-target-browser.mjs`, `demos/mojo/target/cross-compile.sh`,
the `needs` entry in `demos/run-browser-tests.mjs`, and the native-build part of
`demos/mojo/target/README.md` ("The test here needs no compiler in Dolly..." and its shell
block); keep `test/fixtures/` (read by `mojo-browser.mjs`), `patches/` and `gpu/` (applied and
staged by `Dollyfile-mojo`).

## Done when

`git grep -n 'cross-compile.sh\|mojo-target-browser'` finds nothing outside `tasks/`, and
`npm run test:source` passes.

## Closed (2026-11-17)

`demos/mojo/target/test/mojo-target-browser.mjs`, `demos/mojo/target/cross-compile.sh` and the
runner's `needs` entry are gone, and `demos/mojo/target/README.md` keeps the key files and says
the `mojo-gpu` image's test compiles `test/fixtures/` (kept: `demos/mojo/test/mojo-browser.mjs`
and `demos/mojo/prepare-sources.sh` read them). Evidence on `ws/recipes`: `git grep -n
'cross-compile.sh\|mojo-target-browser'` outside `tasks/` finds nothing, and `npm run test:source`
passes (473 of 473).
