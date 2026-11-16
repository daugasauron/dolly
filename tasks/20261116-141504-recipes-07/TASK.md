# python ships libpython3.14.a, 13 MB of its 49 MB, which no recipe links and a session cannot link

- STATUS: OPEN
- PRIORITY: 200
- TAGS: audit,recipes,amy,python,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`).

## State (2026-11-16)

Measured and reproduced in Chrome on `work/round1113/dist/`. Nothing changed yet.

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
