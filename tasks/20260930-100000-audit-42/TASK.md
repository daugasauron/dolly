# Compiler driver dead and duplicated code

- STATUS: OPEN
- PRIORITY: 130
- TAGS: compiler,core,cleanup

`require_command_exports` is always false in `src/compiler.cpp` (~90 unreachable lines);
`parse_raw_signatures` duplicates LLVM's `WasmObjectFile`; about 47% of the file is post-link
validation (`840-1686`); the executable link profile is copied into `toolchain/rust/link.sh`.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

One link profile and one Wasm reader.

## Done when

- Dead code removed; ABI rejection fixtures still pass.
