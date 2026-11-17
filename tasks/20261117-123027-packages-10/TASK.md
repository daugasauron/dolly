# Blender's stage unpacks CPython's tree a second time for the archives the python package's build makes

- STATUS: OPEN
- PRIORITY: 100
- TAGS: packages,audit,python,blender,0.1.9

## State (2026-11-17)

`blender-deps` unpacks CPython's prepared tree again and runs its Makefile for
`Modules/expat/libexpat.a` and the HACL archives, which the python package's build makes for its
own link and installs nowhere; `libpython3.14.a` itself is the python package's again since
`3405a4c2e` (recipes-07 had dropped it before Blender was merged).

Done on `ws/packages`: the python package keeps, in `/usr/lib/python3.14/embed`, CPython's expat
(`libpyexpat.a`) and the five HACL archives its build links (MD5, SHA-1, SHA-2, SHA-3, BLAKE2);
`blender-deps` installs python and builds none of it. `libHacl_HMAC.a`, which the stage made too,
is one no CPython module of this build links, so Blender's link no longer names it.

## Candidate

- Who installs it: Blender's build, any program that embeds CPython; every python install gets
  the archives (see the evidence section for their size).
- What the consumers lose: `blender-deps`' second CPython tree, its Make run and the staging of
  `python/cpython.tar.gz` for it.
- Its own build: the python package's (`make python libpython3.14.a` makes them).
- Verdict: done; python's change rebuilds every image that installs it.
