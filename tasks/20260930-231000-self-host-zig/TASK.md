# Build Zig completely inside the userspace

- STATUS: OPEN
- PRIORITY: 290
- TAGS: toolchain,bootstrap,zig

Owner goal: Zig must be compiled inside Dolly, not on the host. Today host Zig builds the frontend and host LLVM/LLD link zig.wasm (docs/sources.md bootstrap exceptions), used only by ghostty-build.

Upstream bootstraps from C: stage1 zig1.wasm is translated by wasm2c and compiled with a C compiler into zig2, which builds the compiler. First measure whether that chain fits Dolly (C file sizes, compiler memory, time), then decide which backend the result needs.

Done when: an image recipe builds zig from pinned sources with only in-sandbox tools, ghostty-build uses it, and the host exception is removed from docs/sources.md.

## Spike result (2026-10-01, branch `spike/self-host-zig`, `demos/zig-self-host/`)

Feasible now without LLVM. Measurements in `demos/zig-self-host/README.md` on that branch.

- Upstream route (wasm2c of `zig1.wasm`, `cc` it) builds in Dolly (73 s, 3.7 GB)
  but the result overflows the ~0.5 MB JS-engine stack of a browser Worker
  (its largest function has 1,385 locals); no optimisation level fixes it.
- Working chain: `cc` builds the WAMR interpreter, which runs `zig1.wasm` with
  heap frames; zig1 emits a C-backend-only `zig2.c` (64 MB, 270-300 s, 3.2 GB),
  `cc -O2` makes an 8.2 MB `zig` (host-built today: 48 MB), which emits Ghostty
  as C (17-20 s) for `cc`. `system-build` to a working terminal image: 513-571 s.
  The terminal browser test passed on that plugin in Chromium and Firefox.
- Not feasible: an LLVM-enabled Zig (LLVM static libraries are 880 MB, in no
  image) and `zig build` (this zig only emits C).
- Next: replace `zig.dm` with these stages, switch `ghostty.dm` to the C path,
  drop `build-native-zig.sh`, the CMake zig target and the docs/sources.md row.
