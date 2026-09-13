# Reject unsupported nested source archive paths before publication

- STATUS: CLOSED
- PRIORITY: 75
- TAGS: audit,bug,build

A real source directory containing `bad\name.c` is accepted by the source tar
writer and replaces its previous output. Dolly's extractor rejects that member.
The writer only validates the explicitly supplied destination, not descendants.

## Done when

- Validate every collected destination with the same supported archive path rules.
- Reject the bad source before replacing prior output and leave no staging files.
- Preserve every existing published source archive and image identity.

## Result

Moved the existing path validation into recursive collection; the implementation
adds no lines. The real-filesystem regression failed before the change because
the invalid nested source was published. It now fails preparation, preserves the
previous output and leaves no temporary staging directory.

The official 20-image command passed in 8.5 s with every artifact reused. All 123
recorded source files retained their exact hashes. All 286 source checks pass in
2.86 s, including the tar/gzip short-write and failure-preservation cases.
