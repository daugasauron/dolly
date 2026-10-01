# Compiler driver dead and duplicated code

- STATUS: CLOSED
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

## Closed (2026-10-01, branch `work/core-polish`)

`require_command_exports` and `parse_raw_signatures` were already gone
(`638b863`); the driver reads Wasm only through `WasmObjectFile`. This branch
removed the rest of the dead and duplicated driver code: the GOT skip and
needed-library provider machinery that accepted plugins the loader refuses (a
plugin with needed libraries is now rejected at link), the second validation
pass after stamping (every link parsed its output twice more), the hand-written
`dolly.abi` section writer (now `append_custom_section`), the always-true
`export_dynamic` parameter of `link_side_module`, the per-job `-mllvm
-wasm-enable-eh` already set globally, `DOLLY_CC_TRACE`, two Dolly-only no-op
flags, the `-sMEMORY64=1` spelling, the `--allow-shlib-undefined` translation
and five history-narrating comments. The executable link profile copies in
`demos/rust` and `demos/zero-ad` are demo-owned. Evidence: `test/cpp-browser.mjs`,
`test/process-browser.mjs` and `test/core-browser.mjs` (ABI rejection fixtures)
pass in Chrome and Firefox on the rebuilt `default` image.
