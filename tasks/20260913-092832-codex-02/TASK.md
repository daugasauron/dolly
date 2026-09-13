# Preserve working-directory identity across renames

- STATUS: OPEN
- PRIORITY: 300
- TAGS: audit,bug,core,filesystem

No description.

## Evidence

Reproduced in Chrome and Firefox on `ff633f7`:

1. Create `/tmp/a`, then `chdir("/tmp/a")`.
2. Rename `/tmp/a` to `/tmp/b` using absolute paths.
3. `getcwd` still returns `/tmp/a`; creating a relative `marker` fails with ENOENT.
4. Recreate `/tmp/a` and create relative `marker2`. In Chrome this writes into the replacement directory, not `/tmp/b`.

[`path_from_packet` and the cwd operations](../../src/process-kernel.c) retain a pathname and concatenate relative paths.
Retain directory identity in the kernel rather than relying on rewriting cached path strings.

## Done when

- Relative operations continue to target the original directory after its rename or an ancestor rename.
- Reusing the old pathname cannot redirect the process's relative writes.
- `getcwd` reports the current path when resolvable and handles an unlinked directory explicitly.
- Browser checks cover rename, replacement, and independent parent/child working directories.
