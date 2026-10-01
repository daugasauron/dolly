# Repository weight from generated files and media

- STATUS: CLOSED
- PRIORITY: 120
- TAGS: cleanup,demo

`sites/daugasauron.com/agents/` tracks 59.3 MB of mp4/png (about 93% of the pack);
`src/slopyard/legacy-programs.lua` is 47,825 lines (2.7 MB) translating old saved JS
controllers; `src/ghostty/generated/uucode-tables.zig` is a 5.2 MB generated file;
`src/rts/demo.tar.gz` is a committed 872 KB binary; `designs.lua` is 698 KB on 141 lines.

## Evidence

Established: CONFIRMED BY READING. Measured with `git ls-files` + `du` at main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Generated files are generated; media and legacy converters live where they are needed.

## Done when

- Owner decides per item; removals do not break the affected demo.

## Decisions (2026-10-01, integrator)

Measured at `7779ddf`: pack 65.7 MiB; history keeps every removed byte, so
deleting from HEAD would not shrink a clone.

- `sites/daugasauron.com/agents/` videos and posters: kept. They are the
  published `/agents/` showcase, the source of that page.
- `demos/rts/demo.tar.gz` (872 KB, 11 files of one recorded match): kept. It is
  demo content that `rts-arena.dm` unpacks, not generated output.
- `src/ghostty/generated/uucode-tables.zig` (5.2 MB): generated, and should be
  generated in the sandbox now that Zig self-hosts; moved to
  [zig-follow-ups](../20261001-091000-zig-follow-ups/TASK.md).
- `demos/slopyard/src/legacy-programs.lua` (2.6 MB) and `designs.lua`
  (0.7 MB): Slopyard data, handed to the Slopyard track to drop or regenerate.
