# Image builds rewrite tracked pin lines

- STATUS: CLOSED
- PRIORITY: 130
- TAGS: iteration,build,dollyfile

Pins are rewritten twice per build (`scripts/build-image.mjs:42`,
`scripts/prepare-image-sources.sh:639`). The last `core-tools.dm` commit touched 41 Dollyfile
paths, producing noisy diffs and merge conflicts between worktrees.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Pin updates are an explicit step or disappear with a v5 design.

## Done when

- A normal image build leaves tracked files unchanged unless a recipe changed.

## Resolution (2026-09-30)

By design. Pins stay in recipe text (no lock file, owner decision); tooling rewrites them after an upstream change.
