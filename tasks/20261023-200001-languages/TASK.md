# More languages in Dolly: Go and others

- STATUS: OPEN
- PRIORITY: 120
- TAGS: toolchain,packages

Owner (2026-10-23): "Are there any other languages that can be added? go?"

Today: C and C++ (`cc`, LLVM built in Dolly), Rust (rustc and Cargo built in Dolly), Zig (with
LLVM), Python (CPython), JavaScript and TypeScript (QuickJS, Janis, tsc), Lua, Mojo.

Done when: `investigation.md` here says, for Go and the other candidates, what it takes to
build each inside Dolly from upstream source for wasm64, measured where it can be, with a
ranked recommendation; the owner picks.
