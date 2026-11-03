# Audit: what makes the images large, and what can be stripped

- STATUS: OPEN
- PRIORITY: 230
- TAGS: images,audit

Owner (2026-11-03): "I also want an audit of what is making the images so large, I think it's
fonts mainly? I think a lot of that can be stripped."

First numbers (2026-11-03, `dist/dolly-*-system.snapshot` in a tree of 109 images): `system`
161 MB, `pi-minimal` 99 MB, `default` 19 MB; the largest are models and game data (qwen3.5-4b
2.1 GB, zero-ad 1.9 GB, dollyfile-studio 1.7 GB, pi-local 1.7 GB, lean-meta 1.6 GB). The
terminal's fonts are in every image with a display: IosevkaTerm-SemiBold.ttf 7.7 MB,
DroidSansFallback.ttf (CJK) 3.4 MB, NotoEmoji-Regular.ttf 0.9 MB, about 12 MB, some 7% of
`system`. What a page downloads is an image's packs (`dist/packs/`), shared between images; a
snapshot file's size is not by itself what a user fetches.

The audit: for the images people open (`default`, `system`, `pi-minimal`, `pi-phone`, `python`,
the toolchains), measure what each holds by kind and by origin (fonts, debug sections and
symbols in executables and libraries, static archives and headers left in applications, docs,
locales, test data, duplicates between packs), what a page downloads for each (packs, compressed),
and what could go: each with its measured saving and what would break. Fonts: whether the
terminal needs the whole of Iosevka (subsetting to the glyphs it draws), whether the CJK and
emoji fallbacks belong in every image or in a package, and what `display.c` reads.

Done when: the table is in this task, the confirmed savings are made (recipes, staging, or a
proposal for the owner where it changes what a base image contains), and the images are rebuilt
and pass their tests.
