# An image keeps /workspace: a recipe puts AGENTS.md there for Pi to read at start

- STATUS: CLOSED
- PRIORITY: 355
- TAGS: dollyfile,images,npm,0.1.6

The owner, 2026-11-11 10:00 JST:

> Also I think there is something weird/specific about /workspace such that a build can't place
> things there directly? Not sure about this but it should be possible to have a dolly-build
> place files (such as AGENTS.md) in /workspace such that it gets preloaded when starting pi.

## Found (2026-11-11)

`/tmp` and `/workspace` were scratch that no image retained (`src/fs-record.h`
`dolly_fs_unretained_path`, `src/image-names.mjs` `unretainedPath`): a recipe's
`FILE /workspace/AGENTS.md` was written during the build and left out of the image, and
`FOLDER`, exports and `COPY` refused it. Only boot()'s `files` (dolly-build's `public/workspace/`)
reached it, at each fresh boot. No recipe of the catalog wrote `/workspace`, and build steps run
in `/`, so retaining it changes no image.

Done when a recipe's `FILE /workspace/AGENTS.md` is in its image and Pi reads it at start
(a test), and `docs/dollyfile.md` and `docs/embedding.md` say so.

## Closed (2026-11-11)

Done in `05ac8d656` and `83c31fa31` (merged in `25ad45488`): `/workspace` is retained as any path
is and `/tmp` alone is scratch; `docs/dollyfile.md` and `docs/embedding.md` say so. On the 0.1.6
compiler round's catalog (`6fdcad104`): `test/default-browser.mjs` builds a recipe with
`FILE /workspace/AGENTS.md` and finds it in `/workspace`, where ENTRY starts (Chromium,
Firefox), and `demos/pi/test/pi-session-browser.mjs` finds Pi starting in `/workspace` sending the
model its `AGENTS.md` (Chromium, Firefox; with the file in `/tmp` the check fails).
