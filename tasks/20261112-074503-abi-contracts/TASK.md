# What a host depends on is in a contract: malloc, boot-control files, the image directory, mailbox words

- STATUS: OPEN
- PRIORITY: 360
- TAGS: abi,architecture,donna,audit,0.1.6

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, A3). `AGENTS.md`: "The core interface must remain small, typed,
inspectable, and versioned."

## State (2026-11-12)

On `fix/batch`, for the pass after the batch round (a contract WAT is a pinned document):
- 1: `malloc` and `free` are exports of `abi/dolly-supervisor-0.wat`: a thread's mailbox, a
  terminal line and a boot file's bytes are kernel memory the host fills or reads. A
  mailbox-only export would replace one allocator call with another.
- 2 and 3: `abi/README.md`, "Images and boot files": the build ID's computation, the catalog
  record, metadata format 2 with what a reader checks, the packs, and each `/etc/dolly/` file the
  host writes or reads. Paths stay text: a WAT exports integers only.
- 4: `build/generated/dolly-kernel-contracts.h` holds every kernel-boundary contract's constants
  (`generate-abi-constants.mjs`); `src/dolly.c` and `host/snapshot/kernel.c` assert their
  mailboxes' words against them, as upload's do. On the way: the snapshot contract's
  `DOLLY_SESSION_HEADER_SIZE` (64, the mailbox) shared its name with a save's 16-byte header in
  `src/session-records.h`; it is `DOLLY_SESSION_MAILBOX_HEADER_SIZE` now, and `snapshot.h` copies
  no constant.
Left: Donna reading these from `dolly-abi.json` and the README (told).

## Found, and do

1. The supervisor allocates each process's mailbox with `kernel.malloc`/`free`, exported only as
   the Ghostty plugin's imports (`abi/dolly-kernel-plugin-0.wat:16-19`). A supervisor export
   allocates and frees the mailbox; boot files use the existing transfer ranges.
2. The host writes or reads `/etc/dolly/recipe.locator`, `recipe.rows`, `upload.Dollyfile`,
   `image.manifest`, `artifacts/N`, `image`, `entry`, `environment`, `enabled`, described in
   comments only. Their paths become constants of `abi/dolly-image-0.wat` (so `dolly-abi.json`
   carries them) and `abi/README.md` gives a paragraph per file.
3. The image directory (`dolly-images.json`, `dolly-NAME-system-snapshot.json` format 2, pack
   naming, the build ID's computation) is written down as a contract in `docs/`, with the fields a
   reader must check.
4. `DOLLY_TERMINAL_WORD_*` and `DOLLY_SESSION_WORD_*` are generated with an `offsetof` check as the
   process structs are.

## Done when

Donna types none of these by hand (its `images.rs`, `nena.rs`, `supervisor.rs` read them from
`dolly-abi.json` or the documented format), and a source test checks each against the C.
