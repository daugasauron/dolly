# amy files of a package not installed downloads its whole snapshot: 33 s and a quota slot for Qwen3.5-2B's three lines

- STATUS: CLOSED
- PRIORITY: 70
- TAGS: audit,amy,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`).

## State (2026-11-17)

Fixed on `ws/seed` (`7079a2d21`; the engine is in the seed: every image rebuilds; amy with it), the Do's
second way: `amy files` of a package not installed is dropped. The engine writes the record: an
`INSTALL` row the filesystem keeps, a build's or a session's, lists the package's files in
`/etc/dolly/files/NAME` (`programs/dollyfile.c`, `record_files`), so a package an image's build
installed has its list too, and `amy files NAME` only prints that record; without one it says the
package is not installed and fetches nothing. `amy install` takes its summary from the record
(`summarize`); its own snapshot listing (`list_files`, `files()`) is gone. `amy info` does not
say a package's size: the index is written from the recipes (`scripts/generate-routes.mjs`), and a
package's size exists only once it is built; `amy install` says the files and bytes it added.

## Found

`amy files NAME` for a package the session has not installed fetches the package's whole snapshot
into `/etc/dolly/artifacts/`, lists its records and deletes it (`programs/commands/amy.c`,
`files()`), as `docs/dollyfile.md` says ("reads it from the release's snapshot"). In a fresh
`default` session:

```
$ time amy files qwen3.5-2b
amy: fetching qwen3.5-2b from http://127.0.0.1:36601/
1396198496 /usr/share/dolly/llm/qwen3.5-2b.gguf
717 /usr/share/dolly/llm/qwen3.5-2b.json
11544 /usr/share/licenses/qwen3.5-2b/LICENSE
real 33.058
```

`amy files jq` takes 0.16 s. Each such call also spends one of the page's 64 snapshots
(`20261116-141504-recipes-06`) and holds the snapshot in the kernel's memory while it lists it. The
release already publishes each image's file list beside its packs
(`dist/dolly-NAME-system-snapshot.json`, `manifest`: paths, without sizes).

Evidence: `work/audit-1116-evidence/recipes/files.jsonl` (case `amy-files`).

## Do

Either the package service hands over a package's list (paths and sizes) without its snapshot,
from a file the release writes beside the metadata, or `amy files` of a package not installed is
dropped and `amy info` says how large the package is.

## Done when

`amy files qwen3.5-2b` in a fresh session answers in under a second and spends no snapshot.

## Closed (2026-11-17)

On the rebuilt seed (image inputs `58c25885…`), in a fresh `default` session: `time amy files
qwen3.5-2b` answers "amy: qwen3.5-2b is not installed: amy files lists the files of an installed
package" in 0.029 s (Chromium) and 0.040 s (Firefox), and no `/etc/dolly/artifacts` was made: amy
asks the package service nothing (`work/audit-1116-evidence/core/fix-seed/seed-checks-a-chromium.log`,
`-firefox.log`). `/etc/dolly/files` holds the records of the packages `default`'s build installed
(amy, core, curl, display, dollyfile, nena, posix, ps, transfer), and `amy files curl` prints its
record. `amy-browser`'s `amy` case passes in Chromium and Firefox (`amy-subset-3.log`): the image's
curl record with sizes that `stat` confirms, a package not installed refused with nothing fetched,
python's install summary counting the lines `amy files python` prints, and the engine's record of
a sealed package (`14 /usr/share/connects`).
