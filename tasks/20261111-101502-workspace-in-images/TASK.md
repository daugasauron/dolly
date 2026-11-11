# An image keeps /workspace: a recipe puts AGENTS.md there for Pi to read at start

- STATUS: OPEN
- PRIORITY: 355
- TAGS: dollyfile,images,npm,0.1.6

The owner, 2026-11-11 10:00 JST:

> Also I think there is something weird/specific about /workspace such that a build can't place
> things there directly? Not sure about this but it should be possible to have a dolly-build
> place files (such as AGENTS.md) in /workspace such that it gets preloaded when starting pi.

## State (2026-11-11)

Found, not fixed. `/tmp` and `/workspace` are scratch that no image retains
(`src/fs-record.h` `dolly_fs_unretained_path`, `src/image-names.mjs` `unretainedPath`): a
recipe's `FILE /workspace/AGENTS.md` is written during the build and left out of the image, and
`FOLDER`, exports and `COPY` refuse it. Only boot()'s `files` (dolly-build's `public/workspace/`)
reach it, at each fresh boot. No recipe of the catalog writes `/workspace`, and build steps run in
`/`, so retaining it changes no image.

Fix, decided: `/workspace` is an ordinary path an image retains when a recipe names it; `/tmp`
stays scratch. Pi, whose ENTRY runs in `/workspace`, reads its `AGENTS.md` there; the page's
files still lie over the image's at a fresh boot.

Done when a recipe's `FILE /workspace/AGENTS.md` is in its image and Pi reads it at start
(a test), and `docs/dollyfile.md` and `docs/embedding.md` say so.
