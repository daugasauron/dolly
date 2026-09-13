# Accept safe dot-prefixed paths in tar archives

- STATUS: OPEN
- PRIORITY: 200
- TAGS: audit,bug,filesystem

No description.

## Evidence

Firefox on `ff633f7` successfully extracted a ustar archive containing `file.txt`.
Equivalent archives containing `./file.txt` or a `./` directory entry failed with `Invalid argument`.

An ordinary producer is:

```sh
tar -cf archive.tar -C source-directory .
```

[`valid_member`](../../modules/tar.dm) rejects every `.` component.
Earlier local evidence: `build/ripgrep-probe.OHvH0j/browser-link.log`.

## Done when

- Safe leading `./` components are normalized and a directory root marker is accepted.
- Root markers are never treated as regular files.
- Absolute paths and `..` traversal remain rejected.
- A browser extraction check compares normal, dot-prefixed, root-directory, and traversal entries.
