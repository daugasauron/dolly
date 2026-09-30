# Display handshake and graphics paste bounds

- STATUS: OPEN
- PRIORITY: 190
- TAGS: bug,boundary

`src/host/display.mjs:58-64` accepts `eventCapacity=0` (passes the power-of-two check) and never
range-checks the event ring against memory. A bad frame throws inside `requestAnimationFrame`
(`:427-429`), freezing the display silently without `displayFatal`. Graphics-mode paste accepts
256 KiB but the ring holds about 22 KiB and whatever was pushed before `pushText` returned false
is already delivered (`:154-171`). `abi/dolly-display-0.wat:3` says bootstrap-only but nothing
enforces it.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Handshake fields are fully validated; bad frames fail visibly; paste is all-or-nothing.

## Done when

- Unit tests with malformed handshakes/frames; oversized graphics paste is rejected whole.
