# Hand-copied ABI constants and duplicated signal sets

- STATUS: OPEN
- PRIORITY: 150
- TAGS: core,maintainability

Base process ABI constants are copied by hand into JS (`src/process-supervisor.mjs:10-21`, a
literal `5` at `:526`; `src/process-worker.mjs:12-19`, `:491`, `:538`;
`src/process-ffi.mjs:35-38`) while thread, host, GPU and audio constants are generated from WAT.
The supported-signal set is written five times (`process-kernel.c:274`,
`process-supervisor.mjs:19`, `runtime-adapter.c:202-206`, `:534-538`, `signal.c:60-62`). HTTP
constants are hand-written (`src/http-broker.mjs:7-9`). Four near-identical generators exist
(`scripts/generate-{host,threads,gpu,audio}-abi.mjs`).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

One generator produces every contract's constants from its WAT/header; JS and C import them.

## Done when

- No numeric ABI constant is duplicated by hand between C and JS; the artifact ABI test fails if
  a generated constant drifts.
