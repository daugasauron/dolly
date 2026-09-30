# Pi build ships emitted output twice and skips type checking

- STATUS: OPEN
- PRIORITY: 120
- TAGS: pi,demo,build

`modules/pi-build.dm`: tsc emits the seven workspaces with `noCheck`; the emitted `dist-dolly`
output also remains under `/usr/src/pi-source`, so it ships twice.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Images retain one copy of the emitted Pi code.

## Done when

- Pi image size drops by the duplicated tree; Pi browser check still passes.
