# Zig and Ghostty inside Dolly

Status: cold-browser source build passes  
Last updated: 2026-08-29

## Result

Dolly bootstraps the compiler shipped in the pinned Zig 0.16.0 source archive,
uses it to translate pinned Ghostty source to C, compiles that C with Dolly's
wasm64 Clang, archives it as `/usr/lib/libghostty-vt.a`, and links both the
`/usr/bin/ghostty-vt` probe and `/usr/libexec/dolly/display.wasm`. Every
compilation step happens after browser startup against the in-memory WasmFS. No
native Zig executable, generated Ghostty object, or host build service enters
the sandbox.

The target is Ghostty's upstream `libghostty-vt`, not its GTK or macOS desktop
application. This supplies the parser, state machine, screen model, and key
encoder Dolly needs. A small Dolly-owned software renderer loads pinned
IosevkaTerm SemiBold through WasmFS and rasterizes the Ghostty grid into shared
RGBA buffers. DOM event capture, IME composition, fullscreen requests, and the
final checked canvas blit remain browser responsibilities; their interpretation
and all terminal modes remain inside Dolly.

## Exact compilation chain

```text
pinned WAMR C source --Dolly cc--> /usr/libexec/dolly/zig1
                                      |
                                      | interprets
                                      v
pinned Zig stage1/zig1.wasm + stage1/wasi.c
                                      |
                                      | /usr/bin/zig build-obj -ofmt=c
                                      v
pinned Ghostty + uucode Zig source --> /tmp/ghostty/ghostty-vt.c
                                      |
                                      | Dolly cc -c
                                      v
                          /tmp/ghostty/ghostty-vt.o
                                      |
                                      | Dolly ar
                                      v
                          /usr/lib/libghostty-vt.a
                              /                 \
             Dolly cc -lghostty-vt             Dolly cc + stb/Iosevka
                            v                     v
                 /usr/bin/ghostty-vt   /usr/libexec/dolly/display.wasm
```

`/usr/bin/zig` is a small Dolly executable that invokes the private
`/usr/libexec/dolly/zig1` filesystem command through Dolly's synchronous
lifecycle API. The latter is a source-built WAMR interpreter plus Zig's
upstream stage1 WASI adapter. WAMR was chosen after Wasm3's recursive bytecode
preparation exhausted Chrome's native stack on Zig's deeply nested module.
WAMR's non-recursive fast interpreter prepares that module without adding host
authority. Its native-machine shortcuts are explicitly disabled:
`WASM_ENABLE_LABELS_AS_VALUES=0` avoids computed-goto code pointers, and
`WASM_CPU_SUPPORTS_UNALIGNED_ADDR_ACCESS=0` makes the prepared stream use
portable aligned loads. Those shortcuts are valid for WAMR's normal native
hosts, but not for WAMR itself compiled as wasm64. Keeping the fast bytecode
preparation while disabling the shortcuts gives Dolly the correct full
Ghostty build in minutes; the classic interpreter is correct but takes hours
on the same input.

The wrapper reports `zig version`/`zig --version` directly from the exact
0.16.0 source pin. Zig's source-provided stage1 seed is a bootstrap compiler;
its metadata-only version branch traps under the interpreter, while its
generated-C compilation path is the part Dolly intentionally exposes. All
compilation subcommands still execute `zig1.wasm`.

The nested `zig1.wasm` is a compiler implementation detail, not a Dolly
program format. It is wasm32, but its WASI file calls are native bindings to
Zig's `stage1/wasi.c`, which calls the outer Dolly libc and therefore reads and
writes the same WasmFS. Zig emits C; Dolly's normal compiler then produces the
actual wasm64 filesystem executable or archive that shares Dolly's memory and
table when loaded.

## Pinned inputs

The canonical values are in `config/source-pins.sh`:

| Input | Pin |
| --- | --- |
| Zig | 0.16.0 source archive plus SHA-256 |
| WAMR | exact Git commit |
| Ghostty | exact Git commit `4540d499ae463ad7b90f28f6f852f64f844c160f` |
| uucode | exact source archive commit plus SHA-256 |

The build packages only source, headers, licenses, Zig's source-provided
`zig1.wasm` bootstrap seed, and generated configuration inputs. The final
Ghostty C, object, archive, and command are created in WasmFS during
`/etc/dolly/startup.slop`.

Ghostty's optional Kitty graphics transport is disabled. That feature assumes
host files and shared-memory image transport that are outside Dolly's text
terminal contract. The VT parser, Unicode tables, grid, styles, cursor state,
and C inspection API remain enabled.

## Browser acceptance proof

A cold browser run proves all of the following in one sandbox lifetime:

1. GNU Make is compiled and executes the Zig/Ghostty graph through Slop.
2. WAMR is compiled from its packaged source to `/usr/libexec/dolly/zig1`.
3. `/usr/bin/zig` translates a small Zig fixture; Dolly compiles and executes
   the generated C and observes the expected value 42.
4. The same compiler translates Ghostty's complete VT source graph.
5. Dolly compiles and archives the generated Ghostty C and links
   `/usr/bin/ghostty-vt` against it.
6. The command feeds text and an SGR bold sequence into Ghostty, reads the
   10-by-3 grid through the public C API, and prints all three rows and styles.
7. The browser proof invokes `zig version`, verifies the archive path, and
   invokes `ghostty-vt` again through ordinary PATH lookup.
8. Dolly loads the filesystem-resident display module, publishes a stable RGBA
   frame, accepts raw Chrome key events (including Backspace and Enter), handles
   Ctrl+/Ctrl- font sizing inside the sandbox, resizes on fullscreen, and keeps
   the interactive Lua REPL working.

The interpreted Ghostty translation is intentionally simple and currently
takes several minutes. Performance and parallel compilation are not part of
this proof; the finite compiler/filesystem/lifecycle contract is.

## Generated-C compatibility

Zig 0.16's `zig.h` selects its C11 atomics path when `stdatomic.h` merely
exists, even when `__STDC_NO_ATOMICS__` is set. Dolly's compatibility wrapper
hides that header-existence probe so upstream `zig.h` selects its own
`__atomic_*` implementation. The wrapper also replaces
`__builtin_return_address` with zero because Zig uses it only as opaque
allocator/debug metadata here and Emscripten would otherwise add an unwanted
JavaScript import.

These are generated-C compatibility choices. Ghostty itself is not patched to
call the browser, use another filesystem, or own a standalone Wasm memory.

For local iteration, `DOLLY_GHOSTTY_C_CHECKPOINT` may point at a generated C
file within the repository. The build preloads that file at Ghostty's normal
target path, then still compiles, archives, and links it with Dolly's in-sandbox
toolchain. This avoids repeating the slow interpreted Zig translation while
debugging presentation. Release/cold proofs omit the variable and regenerate C
from the pinned Zig and Ghostty sources.

## Security boundary

- Zig, WAMR, and Ghostty introduce no browser imports.
- Their source and generated files live only in Dolly's in-memory WasmFS.
- WAMR's inner WASI surface terminates at Dolly libc; it is not implemented by
  JavaScript and cannot reach a host filesystem or host process.
- Process, socket, sleep, and concurrency assumptions use Dolly's finite
  synchronous behavior or fail with `ENOSYS`.
- `env.dolly_http_dispatch` remains the only agent-selected network edge of
  the outer runtime.
- A corrupted compiler or terminal parser can corrupt the disposable Dolly
  instance, but cannot acquire authority beyond the outer runtime's explicit
  browser import allowlist.

## Display boundary

`abi/dolly-display-0.wat` defines a versioned fixed-record input ring and two
bounded framebuffer addresses. The display module owns Ghostty parsing,
mode-aware key encoding, the Iosevka TTF, glyph rasterization, terminal sizing,
and frame publication. JavaScript validates the published index, dimensions,
stride, capacity, and memory range, copies one stable complete frame, and calls
`putImageData`. It contains no VT parser, cell model, font renderer, or command
logic.

Before the source build finishes, the display module cannot exist. A single
bootstrap text callback therefore updates a plain Iosevka browser view with the
traced startup output. The view is hidden when the resident module activates;
subsequent terminal output is consumed entirely inside the sandbox.
