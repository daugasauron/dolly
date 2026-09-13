# Preserve existing members when updating an archive

- STATUS: OPEN
- PRIORITY: 300
- TAGS: audit,bug,core,build

## Evidence

In a fresh default-image browser sandbox, compiling a replacement `process-mmap.o`
and running `ar r /usr/lib/dolly/process/libdolly-process.a /tmp/process-mmap.o`
returns zero but drops every other member. The next link fails with missing
`__get_tp`, `__dolly_dso_allocate`, and process syscall definitions.
`run_archive` builds a new archive using only its command-line inputs.

## Done when

- `ar r[csD]` replaces matching members and preserves unmentioned members.
- Adding a new object and using a path to a replacement object both work.
- Invalid archives or missing input files fail without changing the old archive.
- A real browser compiles, updates, links, and runs an archive regression.

## Fix under verification

`ar r[csD]` now preserves old members and replaces matches by basename. Replacement
considers only unconsumed members of the original archive: new inputs may share a
basename, as Git's `builtin/commit.o` and `commit.o` do. An earlier version of the
fix collapsed those inputs and failed the real Git link; that version was not committed.
Chrome and Firefox now compile/link/run both archive updates and duplicate-name
archives against the rebuilt compiler. The core gate additionally checks missing
inputs, invalid archives and unchanged deterministic output. Git/default rebuild remains pending.
