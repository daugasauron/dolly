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
is one no CPython module of this build links, so Blender's link no longer names it. The build
renames expat 2.8's `XML_SetHashSalt16Bytes`, which `pyexpatns.h` misses, so that `libpyexpat.a`
and the expat package link together (below).

Built in `work/packages`: `python` with the six archives in `/usr/lib/python3.14/embed` (50,244,409
bytes against the round's 49,906,887: 337,522 bytes more in every image that installs python).

Built in `work/packages`: `blender-deps` over it (458,945,739 bytes, 692 s, against 460,838,815 when
it made the archives itself); its embedded interpreter links without `-lHacl_HMAC` and runs.

Found in `work/packages`: Blender's link over the expat package failed, `duplicate symbol:
XML_SetHashSalt16Bytes`, defined in `libpyexpat.a(xmlparse.o)` and `libexpat.a(xmlparse.c.o)`.
CPython 3.14 bundles expat 2.8.2, whose `XML_SetHashSalt16Bytes` its `pyexpatns.h` does not rename;
Blender's own 2.7.5 had no such function. The python package's build now renames it as the header
renames the rest (`PY_CPPFLAGS`), and blender-deps' check links the expat package beside the
interpreter, as Blender does, so that it fails there rather than after Blender's hour of compiling.

Built in `work/packages`: `python` with the rename (50,245,335 bytes) and `blender-deps` over it:
the check now links the expat package beside libpython and `libpyexpat.a` (`XML_ParserCreate` of the
one, `import pyexpat` of the other) and runs.

Built and tested in `work/packages` over the packages and python's embed archives: `blender`
(176,888,721 bytes, 3,404 s; its link names `-lbrotlidec -lbrotlicommon` and the embed archives
without `-lHacl_HMAC`); `demos/blender/test/blender-browser.mjs` passed in Chromium and Firefox (its
Python edits, saves and loads a scene, Cycles renders a PNG that Blender loads back;
`work/packages-evidence-1117/runs/test-blender.log`).

Tested: the `python` session of `demos/python/test/python-browser.mjs` passed in Chromium and
Firefox over this python (`test-python.log`), once its probe installs curl: on integrate/0.1.8 the
probe is `system` with `python`, which only `USE`s curl, so its first step's `curl ... || exit 1`
ended the shell (`sdl2-browser.mjs` the same; both now `installProbe("curl", ...)`, and sdl2's
passes in both). Its `python on default` session fails on integrate/0.1.8 too: `default` keeps no
`/usr/bin/env`, and NumPy's `numpy/_build_utils/gitversion.py`, which Meson runs, starts
`#!/usr/bin/env python3`.

## Candidate

- Who installs it: Blender's build, any program that embeds CPython; every python install gets
  the archives (see the evidence section for their size).
- What the consumers lose: `blender-deps`' second CPython tree, its Make run and the staging of
  `python/cpython.tar.gz` for it.
- Its own build: the python package's (`make python libpython3.14.a` makes them).
- Verdict: done; python's change rebuilds every image that installs it.
