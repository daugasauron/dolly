# integrate/day-candidate: the day's branches merged and tested

- STATUS: OPEN
- PRIORITY: 200
- TAGS: integration

The day round's integration candidate, built in `work/proc-mem` on 2026-11-02 so the
integrator can merge one tested branch into `integrate/2026-11-02` when the round ends.
Evidence: `work/proc-mem/build/candidate-evidence/` (not committed).

## Merged, in order, onto `integrate/2026-11-02` = `fa949c1b`

| Branch | Head merged | Notes |
| --- | --- | --- |
| `integrate/html` | `d9fe83a3` | html@0 bridge on fix/boundary-hang `41c6a754` |
| `core/process-memory` | `761d0cb8` | |
| `fix/abort-own-definition` | `762433c7` | seed: libc `abort` weak again |
| `core/docs-audit` | `1cb873dd` | seed: tar reads pax archives without a path record; `docs/embedding.md` by hand |
| `demo/workaround-removal` | `d7294ff8` | built on core/docs-audit |
| `demo/lean-3` | `bdb49d4b` | |
| `core/stream-capture` | `14b36c24` | the commit, not the head: `5952d104` and `3dbf32ba` are proposals and stay out |

Image inputs: `a58af3f9…` on the base, `fe5261db7b3f17f6d24332acbd6adcfe2efd438c2fcd8ded1617d8a98601739c`
on the candidate (the two seed changes above). Source suite after the merges: 468 pass, 0 fail.

## How the recipes were merged

`work/integrate-merge.sh` takes the branch's side of a recipe conflict and repins. That
dropped integrate/html's recipe content: `core/process-memory`'s pin rows conflicted with
html's `REQUIRES HOST html@0` rows in twelve recipes and the docs recipe's
`dolly-html-0.wat` SOURCE, and the branch's side had none of them (found by running the
script's own CHECK for every branch against the integrate base; the script checks only the
branches of one invocation, and the first invocation stopped at `docs/embedding.md`).
The candidate was rebuilt from `fa949c1b` with `build/candidate-evidence/merge-chain.sh`:
a recipe conflict is merged three-way with the recipe pins zeroed (`work/merge-recipes.py`;
`work/merge-recipes2.py` for the docs recipe, whose SOURCE pins are document digests) and
repinned. Result: 0 CHECK lines for the seven refs.

Three staged-source pins were changed by more than one branch, so no side was right:
pi-dolly's `SYSTEM.md` (html) and `dolly-skill.md` (docs-audit), studio's `studio.tar`
(three branches). They are pinned from the merged sources in `fb57526b` (`studio.tar` by
`scripts/build-source-tar.mjs`, deterministic); `prepare-image-sources.sh` refreshes them
on a build of those images anyway.

`docs/embedding.md`: html's package rows (the `html` module in the host list and in
pi-minimal's modules) with docs-audit's description of `amy` in the default image.

## Builds and tests

(filled in as they finish)

## Lessons

(filled in at the end)
