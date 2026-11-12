# rustc exports what a loaded library imports, not all 254,215 functions

- STATUS: OPEN
- PRIORITY: 230
- TAGS: rust,dso,donna,toolchain

Found by Donna (2026-11-12): wasmtime refuses `/opt/rust-sdk/bin/rustc-real`, "failed to
parse WebAssembly module: effective type size exceeds the limit of 1000000". wasmparser
0.263.0 charges each imported or exported function 2 + its parameters + its results and
refuses a module whose sum reaches 1,000,000, a constant with no wasmtime setting.
`rustc-real` has 254,215 exports of its 328,403 functions and 2 imports: 1,194,067. Chrome and
Firefox load it.

## State (2026-11-12)

Not started. `demos/rust/Dollyfile-rust-build` links `rustc-real` with `-C link-arg=-rdynamic`,
which exports every function: rustc is a `dso@0` host of procedural-macro libraries
(`demos/rust/README.md`). A loaded library shares the host's memory, table and allocator and
holds its own std, whose imports `rust-linker.c` provides, so it likely imports libc, the
allocator and the loader's names, not the compiler's functions. Not measured.

## Do

List the imports of the proc-macro libraries Cargo builds in Dolly (`vendor-crates`, a crate
with `serde_derive`) and keep only those exported from `rustc-real`: an export list in place of
every function, given to the link by its `cc`. No change for Donna's engine: if the imports do
need the compiler's own functions, this is an engine limit and the task closes so.

## Done when

`rustc-real` exports what the libraries it loads import, its proc-macro builds pass in Chromium
and Firefox (`demos/rust/test/vendor-crates-browser.mjs`), and wasmtime parses it.
