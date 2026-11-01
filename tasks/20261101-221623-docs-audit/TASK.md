# Audit: every claim in the documentation, against the code

- STATUS: OPEN
- PRIORITY: 260
- TAGS: docs,audit

## State (2026-11-02)

In progress on `core/docs-audit` (from `integrate/2026-11-02`, fa949c1b).

Scope: `README.md`, `docs/*.md`, `host/README.md`, `abi/README.md`, `demos/*/README.md`,
and the help texts and manual pages the core ships. Method: each document's factual claims
(an operation exists, a limit, an option, a test, a path, a measurement) checked against the
code or by running it; a wrong document fixed, a gone feature cut, a claim the code should meet
but does not filed here as a finding.

## Per document

### README.md

- `gzip` compresses since 68824453 (the night): the core image list said it only unpacks
  (`gzip -dc`) and that `pigz` writes `.gz` files.

### docs/architecture.md

- The core image diagram missed `gzip` among `system-tools`' packages (installed since
  5ec4783c, 2026-10-01). The sentence naming which images install `amy` and `transfer` was
  partial (`x11-desktop`, `tmux-panes` and `ghostty-x11` install `amy` too); it now says
  the rule only.
- Checked: 56 processes (`process-supervisor.mjs`, `process-kernel.c`), 1 MiB packets
  (`process.h`), 1 MiB file blocks and the 128 MiB reserve (`file-blocks.cpp`), `chmod` and
  `chown` (`libc-adapter.c`), `/tmp` and `/workspace` kept empty (`system-snapshot.c`),
  `/run` out of sessions (`session-records.h`), `xargs -P`.

### docs/dollyfile.md

- The host-module examples were wrong: `sdl2` declares `audio@0` and `touch@0` too, `rust`
  `dso@0` as well as `threads@0`.
- "FROM and only EXPORTS (`cc`, `cmake`) or COPY rows (`nvim`, `rust`, `codex`)": `cmake`,
  `nvim` and `codex` hold their builds (SLOP steps, no COPY). Now `cc`, `zig`; `display`,
  `rust`, `cargo`, the packages that do.
- Checked: 128 KiB and 64 KiB text limits (`dollyfile.c`), the role table against the
  recipes, `system`'s and `default`'s host lists, `amy`'s subcommands, the image logs'
  path, Studio's composition.

## Findings (claims the code should meet but does not)

## Not checked
