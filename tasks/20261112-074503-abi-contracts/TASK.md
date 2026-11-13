# What a host depends on is in a contract: malloc, boot-control files, the image directory, mailbox words

- STATUS: OPEN
- PRIORITY: 360
- TAGS: abi,architecture,donna,audit,0.1.6

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, A3). `AGENTS.md`: "The core interface must remain small, typed,
inspectable, and versioned."

## State (2026-11-13)

Donna's answer (2026-11-13): it reads every mailbox word, packet size, errno and process constant
from `dolly-abi.json`; it typed by hand, from `abi/README.md`, the boot files, the image directory's
paths and fields, and it had to read from code what the contract left out. Now in the contract
(`fix/audit-0.1.6`):
- `abi/dolly-supervisor-0.wat`: the event's packing (`DOLLY_PROCESS_EVENT_KIND_SHIFT` 48,
  `_VALUE_SHIFT` 32, a 16-bit value) and a leased device's reply slot (`DOLLY_DEVICE_HEADER_BYTES`,
  `DOLLY_DEVICE_REPLY_HEADER_BYTES`, the five words, `DOLLY_DEVICE_REPLY_PUBLISHED`); the kernel
  packs events with them and asserts its reply struct against them, the lease bridge and the
  supervisor use them. The kernel built from it is byte for byte the one before (`9707352e…`); image
  inputs unchanged (the supervisor contract is not one).
- `abi/README.md`: a snapshot part's record kinds, widths and limits (100,000 paths, 2 GiB), the
  entry's widths and limits, `recipe.locator`'s `FILE:` form, `enabled`'s lines, and the session
  file (`DOLLYSF1`, its metadata's fields, limits and format 4). `dist/rows/` came with
  `fix/catalog-rows`.
The snapshot's and entry's numbers belong in `abi/dolly-image-0.wat`, an image input: they go there
with the next seed round. Left: Donna switching to them (told).

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
