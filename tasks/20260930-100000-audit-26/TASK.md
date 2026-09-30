# Slop does not expand globs in directory components

- STATUS: CLOSED
- PRIORITY: 290
- TAGS: bug,slop,core

A glob in a directory component is returned unexpanded (`src/slop.c:1602-1605`). `rm -f
build/*/*.o` exits 0 and deletes nothing.

## Evidence

Established: REPRODUCED. Chrome, `default` image: `mkdir -p /tmp/g/a && touch /tmp/g/a/x.o && rm
-f /tmp/g/*/*.o; test ! -e /tmp/g/a/x.o` -> status 1 (file not deleted).

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Pathname expansion handles patterns in any component, per POSIX.

## Done when

- Native Slop tests cover `*/*.o`, `a*/b?/c` and no-match literal fallback; browser check
  deletes the file.

## Result (2026-10-01)

Globs expand per path component and a pattern without matches stays literal
(`f70583c`). The case runs in `test/slop-browser.mjs` (Chrome and Firefox) from `test/fixtures/slop-cases.mjs`: "globs expand directory components".
