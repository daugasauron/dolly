# What a host depends on is in a contract: malloc, boot-control files, the image directory, mailbox words

- STATUS: OPEN
- PRIORITY: 360
- TAGS: abi,architecture,donna,audit

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, A3). `AGENTS.md`: "The core interface must remain small, typed,
inspectable, and versioned."

## State (2026-11-12)

Filed.

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
