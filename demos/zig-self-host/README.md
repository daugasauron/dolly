# Zig self-host spike

Feasibility spike: build Zig 0.16 from its source archive inside Dolly with
only the in-sandbox `cc`, following upstream `bootstrap.c`. Measurements are in
[Findings](#findings).

## Images

- `zig-stage1`: zig1 compiled in Dolly from the zig1.wasm seed via wasm2c.
- `zig-stage2`: zig1 emits zig2 as C in Dolly; fails, see findings.
- `zig-stage2-hostc`: zig2 (C backend only) compiled in Dolly from host-emitted C.
- `zig-ghostty-cbe`: Ghostty VT and the display plugin built with that zig2 through C.

## Findings

Upstream chain: `wasm2c zig1.wasm` → `cc zig1.c` → `zig1` emits `zig2.c` →
`cc zig2.c` → `zig2 build` (stage 3). No stage up to zig2 needs LLVM; zig2 has
none. [`zig2-config.zig`](zig2-config.zig) keeps only the C backend
(`dev = .cbe`), which shrinks zig2.c from 215 MB to 64 MB.

Host reference (x86_64, one core; gcc 11.4; Clang 24 is the pinned emsdk
compiler targeting wasm64 PIC, a proxy for Dolly's `cc`):

| Step | Output | Time | Peak RSS |
| --- | --- | --- | --- |
| wasm2c zig1.wasm | zig1.c 254 MB | 0.9 s | 2 MB |
| gcc -Os zig1.c / clang wasm64 -Os | zig1 5 MB / 7 MB .o | 69 s / 65 s | 2.2 / 2.0 GB |
| zig1 → zig2.c, upstream `.core`, x86_64 | 219 MB | 29 s | 1.6 GB |
| gcc -O2 zig2.c (upstream zig2) | 26 MB | 289 s | 5.5 GB |
| zig1 → zig2.c, `.core`, wasm64 | 215 MB | 27 s | 1.9 GB |
| clang wasm64 -O2 / -O1 / -O0 of that | 30 / 34 / 83 MB .o | 196 / 182 / 44 s | 5.3 / 5.9 / 11.3 GB |
| zig1 → zig2.c, `.cbe`, wasm64 | 64 MB | 7 s | 0.8 GB |
| clang wasm64 -O2 of that | 9.5 MB .o | 72 s | 2.0 GB |
| zig1 under WAMR (interpreter) → same zig2.c | byte-identical | 162 s | 0.6 GB |
| `.cbe` zig2 → Ghostty VT as C | 18 MB | 71 s | 0.2 GB |
| clang wasm64 -O2 of Ghostty C | 1.6 MB .o | 10 s | 0.4 GB |
| host Zig + LLVM, same Ghostty object | 1.3 MB .o | 17 s | 0.8 GB |

In Dolly (headless Chrome 151; peak is the renderer process, kernel included):

| Step | Time | Peak |
| --- | --- | --- |
| cc wasm2c.c, run wasm2c | 2 s, 3 s | |
| cc -Os zig1.c (254 MB) | 73 s | 3.7 GB |
| zig1 → zig2.c | fails after ~1 s | |
| cc -O2 host-emitted `.cbe` zig2.c (64 MB), link | 134–149 s, <1 s | 3.4 GB |
| zig2 (8.2 MB; LLVM `zig.wasm` is 48 MB) → Ghostty VT as C | 19 s | 2.3 GB |
| zig2 → compiler_rt as C | <1 s | |
| cc -O2 both, ar | 26 s | |
| cc --dolly-kernel-plugin libdisplay.so (ABI-checked) | 1 s | |

Blockers and requirements found:

- **zig1 overflows the Worker stack.** Chrome gives a dedicated Worker about
  0.5 MB of V8 stack (3,537 recursive calls against 6,962 in node's 984 KB
  default) and `--js-flags=--stack-size` does not change it. zig1 from wasm2c +
  Clang needs more than 4 MB in node 24 (more than 3 MB with TurboFan only) at
  -Os, -Oz, -O1 and -O2: its largest function has 1,385 wasm locals (the seed's
  own maximum is 271). Natively it needs under 1 MB.
- **The self-hosted wasm backend cannot make Dolly objects.** `build-obj`
  panics on function references (`TODO`, i32 table indices); only
  non-PIC executables work. Without LLVM the C backend is the only route.
- **zig.h needs two flags under Clang/wasm64.** It passes `usize`
  (`unsigned long`) to `uint64_t *` (`unsigned long long *`), an error in
  Clang 24, and names an undefined `zig_unimplemented()` for
  `__builtin_wasm_memory_*` (checked under the wrong builtin name).
- The `.core` zig2.c needs 5.3–11 GB in Clang: over the 8 GiB cap at -O0,
  marginal at -O2. The `.cbe` zig2 fits easily.
