# Build Zig completely inside the userspace

- STATUS: OPEN
- PRIORITY: 230
- TAGS: toolchain,bootstrap,zig

Owner goal: Zig must be compiled inside Dolly, not on the host. Today host Zig builds the frontend and host LLVM/LLD link zig.wasm (docs/sources.md bootstrap exceptions), used only by ghostty-build.

Upstream bootstraps from C: stage1 zig1.wasm is translated by wasm2c and compiled with a C compiler into zig2, which builds the compiler. First measure whether that chain fits Dolly (C file sizes, compiler memory, time), then decide which backend the result needs.

Done when: an image recipe builds zig from pinned sources with only in-sandbox tools, ghostty-build uses it, and the host exception is removed from docs/sources.md.
