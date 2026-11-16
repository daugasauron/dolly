# amy files of a package not installed downloads its whole snapshot: 33 s and a quota slot for Qwen3.5-2B's three lines

- STATUS: OPEN
- PRIORITY: 70
- TAGS: audit,amy,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`).

## State (2026-11-16)

Measured in Chrome on `work/round1113/dist/`. Nothing changed yet; low: it is slow, not wrong.

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
