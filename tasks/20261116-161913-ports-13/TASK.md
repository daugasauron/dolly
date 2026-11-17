# LLVM's stage-2 test last ran on 2026-10-25; every release round's fixed point already proves what it checks

- STATUS: CLOSED
- PRIORITY: 70
- TAGS: audit,ports,llvm,cleanup,0.1.8

## State (2026-11-17)

Done on `ws/ports` (`ead02d08c`): the test, its `needs` entry and the table row are gone; the
LLVM README's "Reproducing it" points to the compiler round's fixed point in `docs/sources.md`.
Images the change rebuilds: `dolly-docs` (`docs/browser-stack.md`), built in this tree.

## What

`demos/llvm/test/stage2-browser.mjs` (39 lines) runs `llvm-build`'s rows again in the `llvm-cc`
image, with the compiler built there, and requires every archive, the compiler and the TableGen
tools to be the first stage's bytes (`demos/llvm/README.md:67-73`). The demos runner skips it
("about 50 minutes and 7 GB: it is run on demand", `demos/run-browser-tests.mjs:24`; round 1117's
`demos.log`), and the last runs recorded under `work/` are of 2026-10-08 and 2026-10-25
(`work/evidence-2026-10-08/llvm/tests/stage2-browser-1.log`,
`work/evidence-2026-10-25/runtime/runtime-evidence/stage2.log`: passed in 3,061 s and 4,045 s).
The seed compiler's digest changed in 13 commits since (`git log -G'DOLLY_SEED_COMPILER_SHA256='
--since=2026-10-25 -- config/source-pins.sh`, the last `31d0c617f`).

Each release round checks what makes it hold: `llvm-cc` built by the pinned seed must give the
seed's bytes again (`docs/sources.md:58-61`, `demos/llvm/pin-seed-compiler.mjs:5-6`; 0.1.7's
round: "the compiler is the fixed point c98f9ab6", `9c589654e`). When the compiler `llvm-cc` links
is the seed, stage 2 runs the same rows with the same compiler on the same inputs as stage 1, so
its bytes are stage 1's for the same reason the round's are; the test adds nothing a passing
round has not shown, and costs about 50 minutes when run. `docs/browser-stack.md:121` still
reports its result as current.

AGENTS.md, Zen: "Never keep/add code that 'might be useful in the future'".

## Smallest fix

Delete `demos/llvm/test/stage2-browser.mjs`, its `needs` entry in `demos/run-browser-tests.mjs`,
the README's "Reproducing it" section, and the table row in `docs/browser-stack.md:121`, pointing
both to the fixed point in `docs/sources.md`.

## Done when

`git grep -n stage2-browser` finds nothing outside `tasks/`, and `npm run test:source` passes.

## Closed (2026-11-17)

On `ws/ports`: `git grep -n stage2-browser` finds the name only under `tasks/`, and `npm run
test:source` passes but for the two checks that need a rebuilt `dist/` (`dolly-abi.json`, and the
licence inventory while round 1113's recipes stood in for building). The fixed point of each
compiler round is what shows the compiler rebuilds itself (`docs/sources.md`, "The seed's
compiler").
