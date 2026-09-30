# Zig self-host spike

Feasibility spike: build Zig 0.16 from its source archive inside Dolly with
only the in-sandbox `cc`, following upstream `bootstrap.c`, and build Ghostty
with it. Measurements are in [Findings](#findings).

## Images

- `zig-stage1`: WAMR built in Dolly to run the zig1.wasm seed from the Zig source.
- `zig-stage2`: zig1 emits a C-backend-only zig2 as C; Dolly's cc compiles it.
- `zig-ghostty-cbe`: Ghostty VT and the display plugin built with that zig2 through C.
- `zig-terminal`: `default` with the display plugin from `zig-ghostty-cbe`.

The chain is upstream's with two substitutions. WAMR runs `zig1.wasm` instead
of wasm2c + cc, because that code overflows the Worker stack (below). zig2 keeps
only the C backend ([`zig2-config.zig`](zig2-config.zig), `dev = .cbe`), the one
backend that yields Dolly objects without LLVM, so every object still comes
from Dolly's Clang. Inputs: the pinned Zig archive with
`zig-0.16.0-dolly-native.patch`, pinned WAMR ([`fetch-wamr.sh`](fetch-wamr.sh))
and the WAMR binding from the August prototype ([`wamr/`](wamr/)).

## Findings

Nothing up to zig2 needs LLVM. `.cbe` shrinks zig2.c from 215 MB (upstream
`.core`) to 64 MB.

In Dolly (headless Chrome 151; peak RSS of the renderer, kernel included):

| Step | Output | Time | Peak |
| --- | --- | --- | --- |
| cc WAMR + binding (27 files) | zig1 220 KB | 6 s | |
| zig1 (WAMR) → zig2.c | 64 MB | 266–298 s | 3.2 GB |
| zig1 (WAMR) → compiler_rt.c | 1.3 MB | 27–28 s | |
| cc -O2 zig2.c, compiler_rt.c; link | zig 8.2 MB (LLVM `zig.wasm`: 48 MB) | 126–152 s; 3 s | 3.3 GB |
| zig → Ghostty VT as C | 18 MB | 17–20 s | 2.3 GB |
| zig → compiler_rt as C | | 1 s | |
| cc -O2, ar; cc --dolly-kernel-plugin | libdisplay.so 1.6 MB | 23–27 s; 1 s | |

The whole chain from `system-build` to `zig-terminal` takes 513–571 s,
image packaging included.
`test/terminal-browser.mjs`, pointed at `zig-terminal`, passes in Chromium and
Firefox. Upstream's wasm2c route in Dolly: `cc -Os zig1.c` (254 MB) takes 73 s
at 3.7 GB, then zig1 dies within a second.

Host reference (x86_64, one core; gcc 11.4; "clang" is the pinned emsdk Clang 24
targeting wasm64 PIC, a proxy for Dolly's `cc`):

| Step | Output | Time | Peak RSS |
| --- | --- | --- | --- |
| wasm2c zig1.wasm | zig1.c 254 MB | 0.9 s | 2 MB |
| gcc -Os / clang -Os zig1.c | 5 MB / 7 MB .o | 69 s / 65 s | 2.2 / 2.0 GB |
| zig1 → zig2.c, upstream `.core`, x86_64 | 219 MB | 29 s | 1.6 GB |
| gcc -O2 zig2.c (upstream zig2) | 26 MB | 289 s | 5.5 GB |
| zig1 → zig2.c, `.core`, wasm64 | 215 MB | 27 s | 1.9 GB |
| clang -O2 / -O1 / -O0 of that | 30 / 34 / 83 MB .o | 196 / 182 / 44 s | 5.3 / 5.9 / 11.3 GB |
| zig1 → zig2.c, `.cbe`, wasm64 | 64 MB | 7 s | 0.8 GB |
| clang -O2 of that | 9.5 MB .o | 72 s | 2.0 GB |
| zig1 under WAMR → the same zig2.c | byte-identical | 162 s | 0.6 GB |
| `.cbe` zig2 → Ghostty VT as C | 18 MB | 71 s | 0.2 GB |
| clang -O2 of Ghostty C | 1.6 MB .o | 10 s | 0.4 GB |
| host Zig + LLVM, same Ghostty object | 1.3 MB .o | 17 s | 0.8 GB |

Blockers and requirements:

- **wasm2c's zig1 overflows the Worker stack.** A dedicated Worker gets about
  0.5 MB of V8 stack (3,537 recursive calls against 6,962 in node's 984 KB
  default); `--js-flags=--stack-size` does not change it. In node 24 that zig1
  needs more than 4 MB (more than 3 MB with TurboFan only) at -Os, -Oz, -O1 and
  -O2; its largest function has 1,385 wasm locals (the seed's own: 271). WAMR
  under a 500 KB node stack produces the identical zig2.c.
- **The self-hosted wasm backend cannot make Dolly objects.** `build-obj`
  panics on function references (`TODO`, i32 table indices); only non-PIC
  executables link.
- **zig.h under Clang wasm64** needs `-Wno-incompatible-pointer-types` (it
  passes `usize`, `unsigned long`, as `uint64_t *`) and a definition of
  `zig_unimplemented()` (it looks for `__builtin_memory_size`, not
  `__builtin_wasm_memory_size`). `__builtin_return_address` would import
  `emscripten_return_address`.
- **compiler_rt as C omits strlen/memcmp/bcmp**, which the LLVM path supplies;
  the display plugin needs them ([`zig-ghostty-cbe.dm`](zig-ghostty-cbe.dm)).
- **No stage 3.** `zig build` needs a runnable build runner; this zig emits only
  C, so the chain uses direct `build-exe`/`build-obj` commands.
- `.core` zig2.c needs 5.3–11 GB in Clang, over the 8 GiB cap at -O0.
