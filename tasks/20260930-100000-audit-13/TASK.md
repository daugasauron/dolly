# Kernel/ABI documentation drift (threads, workers, exports)

- STATUS: OPEN
- PRIORITY: 110
- TAGS: doc,core

`docs/architecture.md:40` and `docs/process-model.md:35-36` still say threads are unsupported
(threads@0 exists). `abi/README.md` never mentions threads-0, threads-supervisor-0 or host-0;
`abi/README.md:41` and `docs/architecture.md:20` say one fresh Worker per process (threaded
processes use several). `abi/README.md:126` claims the build derives retained exports exactly,
but `EMSCRIPTEN_KEEPALIVE` adds undeclared exports used by trusted JS
(`dolly_process_take_interrupt` `dolly.c:749`, `dolly_terminal_present_pending` `dolly.c:830`).
`abi/README.md:38` presents INT64_MIN as process-visible. Kernel export types for
display/http/download/upload/snapshot/gpu/audio are never checked (`scripts/build.sh:408-414`).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

ABI docs match the contracts and the build checks every exported type.

## Done when

- Docs corrected; every export used by trusted JS is declared in a contract and type-checked.
