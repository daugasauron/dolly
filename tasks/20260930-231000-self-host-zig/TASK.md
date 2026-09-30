# Build Zig completely inside the userspace

- STATUS: CLOSED
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

## Result (2026-10-01, branch `work/zig-self-host`)

The host exception is gone: `build-native-zig.sh`, `fetch-zig-host.sh`, the
CMake `dolly-process-zig` target, `src/zig/native-*.zig`, `src/process/zig.c`,
the host Zig pins and the docs/sources.md row. The seed never held `zig.wasm`,
so the image build ID is unchanged and `system-build`/`system-tools` are reused.

- New image `zig-build` (`FROM system-build`, `modules/zig.dm`): `cc` builds
  WAMR plus `src/zig/zig1.c`; zig1 runs upstream `zig1.wasm` to emit zig2 and
  compiler_rt as C with `src/zig/config.zig` (`dev = .cbe`); `cc -O2` makes
  `/usr/bin/zig`. Inputs: `default/zig.tar` (patched Zig 0.16 source, SDK) and
  `default/wamr.tar` (WAMR `DOLLY_WAMR_COMMIT`, binding), both SHA-256 pinned.
- `ghostty-build` is `FROM zig-build`; `ghostty.dm` emits Ghostty VT and
  compiler_rt as C and compiles them with `cc` (plus strlen/memcmp/bcmp, which
  C-output compiler_rt leaves to libc). A separate image keeps display edits
  from rebuilding Zig.
- The Zig patch keeps only the std and self-path hunks; the LLVM hunks are gone.

Measured in headless Chrome, two builds of `npm run image -- default`:

| Step | Time | Renderer peak RSS |
| --- | --- | --- |
| cc WAMR + binding | 5 s | 1.3 GiB |
| zig1 → zig2.c | 254–261 s | 3.1 GiB |
| zig1 → compiler_rt.c | 26 s | 4.4 GiB |
| cc -O2 zig2.c | 104 s | 5.2 GiB |
| cc compiler_rt.c, link | 4 s | |
| `zig-build` image, packaging included | 397–403 s | |
| `ghostty-build` (zig → C 17 s, cc 19 s) | 43–44 s (host Zig: 36–41 s) | 1.8 GiB |

`/usr/bin/zig` is 8.2 MB (host-built `zig.wasm`: 48 MB); `libdisplay.so` is
1,644,382 bytes (LLVM Zig: 1,007,438); `ghostty-build` snapshot 209 MB (248 MB).
Renderer peak includes the kernel and exited processes' memories not yet
collected; the spike reported 3.3 GB for the same steps.

Verification: `node --test test/*.test.mjs` (257 pass), `node test/terminal-browser.mjs`
and `node test/core-browser.mjs` pass in Chromium and Firefox on the rebuilt
`default`; `node test/site-browser.mjs chromium` passes; `test/zig-sdk.artifacts.mjs`
passes. Merging needs a re-pin and a rebuild of `zig-build`, `ghostty-build`
and every image that copies the display.
