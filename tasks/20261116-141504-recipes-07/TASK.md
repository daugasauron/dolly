# python ships libpython3.14.a, 13 MB of its 49 MB, which no recipe links and a session cannot link

- STATUS: OPEN
- PRIORITY: 200
- TAGS: audit,recipes,amy,python,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`).

## State (2026-11-17)

Fixed on `ws/recipes` (f66240630): the copy and the export are gone; the `make ... libpython3.14.a`
target stays, since `python` links it. Built in `work/recipes`: python's snapshot is 36,777,256
bytes, 13,058,917 fewer than 0.1.7's 49,836,173; x11-build's is 13.0 MB smaller, python-data's
283,793,297 bytes against 296,825,121. In a fresh `default` session `amy files python` lists
1551 files and no `/usr/lib/libpython3.14.a` (case `python-files`, Chromium and Firefox).
`demos/python/test/python-data-browser.mjs` passed on the rebuilt python-data in Chromium and
Firefox (64.0 s, 73.8 s, with its openblas and numpy sessions), and `python-browser.mjs` passed
(its python session in Chromium, "python on default" in both). Evidence in
`work/audit-1116-evidence/recipes/ws-recipes/logs/` (`build1.log`, `build1b.log`, `a-python.log`,
`a2-python-data.log`, `cases2-*.jsonl`).

Left for the 0.1.8 round: scons has no browser test of its own; Godot's build is its use
(`test/amy-browser.mjs`, "elsewhere"), on the Godot chain this tree does not rebuild, so the
round's Godot build and tests confirm it. Rebuilds python and everything that installs or builds
with it: meson, scons, x11-build and the X, GTK, Mesa, Godot, LLVM and Rust chains.

## Found

`demos/python/Dollyfile-python:232-234` copies `libpython3.14.a` to `/usr/lib` and line 270 exports it
(`EXPORTS LIB python /usr/lib/libpython3.14.a`). It is 13,071,112 bytes of the package's 49.8 MB
(`/usr/bin/python` is 13,923,912). Nothing reads it: no recipe of the catalog says
`-lpython3.14`, `libpython` or `REQUIRES LIB python` (`git grep`), and numpy, pandas and matplotlib
build their extensions against the headers. Every `amy install` of python, numpy, pandas,
matplotlib, seaborn, scons, meson or python-dateutil writes it into the session, and every image
that installs python keeps it.

It cannot be linked from a session either: python links SQLite, bzip2 and XZ by `USE` (lines
11-13), so `libpython3.14.a` refers to their symbols and nobody who installs python gets them.

```
$ amy install python
$ cc -O0 -I/usr/include/python3.14 /tmp/p.c -lpython3.14 -lffi -lm -o /tmp/p     # Py_Initialize, PyRun_SimpleString
wasm-ld: error: /usr/lib/libpython3.14.a(ceval.o): undefined symbol: pthread_getattr_np
wasm-ld: error: /usr/lib/libpython3.14.a(blob.o): undefined symbol: sqlite3_blob_close
... (too many errors)
```

With `amy install sqlite bzip2 xz` added, `-pthread` and `-lsqlite3 -lbz2 -llzma`, the link stops
only at `-lz` (zlib, not installed); a run was not tried.

Evidence: `work/audit-1116-evidence/recipes/debug5.jsonl` (`libpython-embed`), `debug6.jsonl`
(`libpython-embed-full`), sizes by `scripts/snapshot-files.mjs python`.

## Do

Drop the copy and the export (lines 232-234 and 270): nothing uses it ("Never keep code that might be
useful in the future").

## Done when

python's snapshot holds no `libpython3.14.a` and is about 13 MB smaller; python-data's and
scons's browser tests pass.
