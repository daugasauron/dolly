# Pi build ships emitted output twice and skips type checking

- STATUS: CLOSED
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

## Resolution (2026-10-01)

`5af3a6f` moves each emitted `dist-dolly` tree into `/usr/lib/node_modules`
instead of copying it. Measured in the Pi 0.99.2 `pi` image (Chrome):
`find /usr/src/pi-source -name dist-dolly` finds nothing, and the eight
emitted `dist` trees (6,871 KiB by `du -s`) exist once under
`/usr/lib/node_modules/@earendil-works`. `npm run test:demos -- pi` passes and
asserts the coding-agent tree is not left under `/usr/src/pi-source`.

`noCheck` stays: upstream type-checks this exact tag in its own build
(TypeScript 7.0, `npm run check`); Dolly's TypeScript 5.9.3 only emits the
JavaScript. Checking in Dolly would also need declaration emit for every
workspace and `@types/node`.
