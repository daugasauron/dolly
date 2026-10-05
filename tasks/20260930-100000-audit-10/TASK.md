# Hand-copied ABI constants and duplicated signal sets

- STATUS: CLOSED
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

## Progress (2026-10-01)

- Process constants come from one generator (`scripts/generate-abi-constants.mjs`)
  for C and JS; the signal set is the single `DOLLY_PROCESS_SIGNAL_MASK`.
- The HTTP mailbox layout (header size, word indices, states, chunk kinds) is
  now WAT globals; the kernel asserts its struct against them and the broker,
  client, libcurl and tests use the names (`e3c959f`).
- Left: check the display and upload mailboxes for hand-copied offsets the
  same way.

## Progress (2026-10-01, branch `work/core-polish`)

The kernel-plugin loader's import list is generated from the contract next to
its digest (`DOLLY_KERNEL_PLUGIN_IMPORTS`), and the HTTP kernel uses the
generated `DOLLY_HTTP_MAX_BODY`. Checked as the previous note asked: the
display (`host/display/display.mjs:10-49, 99-114`), upload
(`host/upload/transport.mjs`), snapshot (`host/snapshot/transport.mjs`) and
terminal (`host/runtime/runtime.mjs:17-29`) mailboxes still copy their word
indices and sizes by hand from the C structs; `host/http/dolly-http-0.wat` is
the pattern (WAT globals, static asserts in C, generated JS). The device
header shared by GPU and audio is copied in about ten places. Converting them
changes the module digests, so it belongs with the next client rebuild.

## Closed (2026-10-05, big-picture review)

The remaining item is done on `integrate/1005`: commit `0095054c` made the
display, upload, session and terminal mailbox word indices WAT globals; the
page transports import them from the generated `abi.mjs`
(`host/display/display.mjs:11-30`, `host/upload/transport.mjs:2-6`,
`host/snapshot/transport.mjs:3`, `host/runtime/runtime.mjs:3-5`) and the
display and upload kernels assert their struct offsets against them. The
device header is defined once (`src/device-lease.c:12`).
