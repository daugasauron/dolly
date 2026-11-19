# pi-llm holds a second copy of the 1.4 GB Qwen3.5-2B model; python re-exports libffi's files

- STATUS: CLOSED
- PRIORITY: 230
- TAGS: audit,recipes,amy,local-llm,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`).

## Closed (2026-11-19)

The 0.1.8 round (`integrate/0.1.8` at 8d666a4e4, `work/integrate-018`) built pi-llm at 379,482
bytes, and python's record holds no `/usr/lib/libffi.a`, `/usr/include/ffi*.h` or libffi licence
(its manifest names only `/etc/dolly/recipes/Dollyfile-libffi`). On `fix/rc-recipes` pi-llm no
longer installs the model either (`tasks/20261116-141510-recipes-10`): 375,480 bytes, and the
local-llm demo's amy case checks that `amy install pi-llm` reports under a megabyte of its own
(passed in Chromium and Firefox). pi-local's GPU test passed on the rebuilt pi-local in both
browsers, the round's run on its own pi-local as well (`tasks/20261116-141510-recipes-10`).

## Done on ws/recipes (2026-11-17)

Fixed on `ws/recipes` (f66240630, 63e8cba16):

- `Dollyfile-python` drops the three exports and the licence of libffi's, which the installed
  libffi package holds (its `REQUIRES HEADER ffi`, `ffitarget` and `LIB ffi` rows still hold).
  Built in `work/recipes`: in a fresh `default` session `amy install python` installs libffi first
  ("libffi installed: 5 files, 27876 bytes"), `amy files python` lists 1551 files and no
  `/usr/lib/libffi.a`, `/usr/include/ffi*.h` or `libpython3.14.a`, `amy files libffi` holds
  `/usr/lib/libffi.a`, and the regenerated overlaps have no libffi/python line, in Chromium and
  Firefox (case `python-files`; `logs/overlaps-1.txt`); `python-browser.mjs` passed (ctypes,
  `CDLL(None).strlen`, a callback: `logs/a-python.log`).
- `Dollyfile-pi-llm` keeps what it writes: the provider (`/usr/lib/dolly-llm`, the extension, the
  settings) and the descriptions of the three models it does not install, by `FILE` rows, not the
  folder its qwen3.5-2b row fills; it installs pi-dolly first
  (`tasks/20261116-141510-recipes-10`). `demos/local-llm/README.md` says why pi-llm holds those
  descriptions, and `models.test.mjs` checks every model is installed by it or described by it.

Paths under `work/audit-1116-evidence/recipes/ws-recipes/`.

## Found

A package keeps only what it declares, and its `INSTALL` rows serve its build (`docs/dollyfile.md`).
Two packages declare a path that an `INSTALL` row of theirs filled, so the installed package's
files are captured again into their own snapshot.

- `demos/local-llm/Dollyfile-pi-llm` installs `qwen3.5-2b` and then
  `EXPORTS FOLDER local-llm-models /usr/share/dolly/llm`, the directory that package filled. Its
  snapshot holds `/usr/share/dolly/llm/qwen3.5-2b.gguf`, 1,396,198,496 bytes, the same bytes
  (SHA-256 `57a1085840f497d7…`) as the `qwen3.5-2b` package's: pi-llm's own files are 20 KB
  (a provider extension, `settings.json`, `/usr/lib/dolly-llm/` and five model descriptors).
  - `amy install pi-llm` fetches both snapshots: 81.2 s in Chrome against 49.6 s for
    `amy install qwen3.5-2b` alone, and says "pi-llm installed: 10 files, 1396218507 bytes".
  - The round packages it: "packaged 1396403806 byte pi-llm snapshot ... in 41.6s"
    (`work/round1113/build/round-1117.log`); the catalog's packs dedupe the file, a session does not
    (the snapshot moves through the kernel whole, `tasks/20261104-012434-install-copy`).
- `demos/python/Dollyfile-python:39-42` installs `libffi` and then exports its three files again
  (`EXPORTS LIB ffi /usr/lib/libffi.a`, `HEADER ffi`, `HEADER ffitarget`), rows from before libffi
  was a package (5ec4783cc). python's snapshot holds them byte for byte as libffi's
  (`libffi.a` 9,282 bytes, `2701469324f3b7c3…`).

No other package retains a path its install closure holds (`overlaps.txt`: every path two packages
hold, of which these are the only ones inside one package's closure besides directories).

Evidence: `work/audit-1116-evidence/recipes/run-big.jsonl` (cases `pi-llm`, `qwen3.5-2b`),
`overlaps.txt`, `scripts/snapshot-files.mjs` (reads a package's files and digests from its packs).

## Do

- `Dollyfile-pi-llm`: export what the recipe writes, not the directory: the provider's descriptors
  under `/usr/share/dolly/llm/` by `EXPORTS FILE` (or `FILE`) each, instead of `EXPORTS FOLDER`.
- `Dollyfile-python`: drop lines 40-43, the three exports and `FILE /usr/share/licenses/libffi/LICENSE`,
  which libffi's package holds too (the `REQUIRES HEADER ffi`, `ffitarget` and `LIB ffi` rows after
  them still hold, from the installed package).

## Done when

pi-llm's snapshot is under 1 MB and `amy install pi-llm` reports its own files only; python's
snapshot holds no `/usr/lib/libffi.a`; pi-local's browser test passes.
