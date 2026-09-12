# Port status

The image's Dollyfile determines installed tools; `command -v TOOL` checks
the running environment. Exact revisions and preparation live in
[config/source-pins.sh](../config/source-pins.sh), the npm lockfile and pinned
modules. This page records compatibility, not a second source inventory.

| Family | Current support | Important limits |
| --- | --- | --- |
| Slop and core/sbase tools | Separate PATH executables, basic shell scripts and conventional text/file tools | [Slop](slop.md) is not Bash |
| C/C++ | Private Clang/LLD compiler, objects, archives, C++ libraries and process-local DSOs | No native host target, fork or threads |
| Rust / Patti | Seed compiler runs in Dolly; C Patti builds ripgrep, fd, Protox and Codex from source in-browser | Serial target adaptations; external compiler seed; [source details](sources.md#rust-compiler-seed-and-source-built-tools) |
| Codex | Real TUI, shell tools and device-code login | Current-thread Tokio; model endpoints require browser CORS; [port details](codex.md) |
| Make / Ninja | Source-built GNU Make and Samurai; Slop recipes and dependency tracking | `-jN` accepted but serial |
| Git / curl | Local Git plus HTTP clone/fetch/push; Fetch-backed libcurl | CORS applies; no sockets; Git clean/smudge filters unported |
| Lua / QuickJS / Janis | Source-built runtimes sharing WasmFS | Janis is a [finite Node subset](javascript-runtime.md), not native Node |
| TypeScript / Pi | Official tsc runs in Dolly; upstream Pi packages emitted and loaded there | `noCheck` emit, no npm client/native addons; [Pi details](pi-agent-plan.md) |
| Python / Bonnie | Source-built CPython, package resolution, wheels and C/C++ extension builds | No raw sockets or parallel threads; package compatibility is finite |
| Neovim | Source-built editor, Dollyfile highlighting/linting in Studio, Slop shell commands | No PTY `:terminal`, tmux or LuaJIT FFI; [editor guide](neovim.md) |
| raylib / Box3D | Software-rendered 2D/3D games and real 3D rigid-body physics | No DOM/WebGL; serial physics; [display API](display.md) |
| SDL2 / Seven Kingdoms | Source-built CPU rendering, input and two Pi players in the [RTS experiment](rts-arena.md) | No audio/threads; remote model APIs require CORS |
| Zig / Ghostty | Separate private Zig compiler; source-built VT renderer | Builder image only; system copies finished display artifacts |

## Python and Bonnie

`bonnie install PACKAGE` resolves runtime and PEP 517 build requirements,
verifies downloads, builds/stages wheels and publishes the prepared transaction.
`list`, `freeze`, `show` and `check` inspect installed metadata.

CPython identifies as `sys.platform == "dolly"`, not Pyodide. Process-local
DSOs and libffi support `_ctypes` and C/C++ extensions. Socket construction
fails explicitly; an importable networking package is not proof its transport
works. Fork and actual threads are absent; the Python compatibility path runs
Thread targets serially.

Source builds of NumPy 2.5.2 and Pandas 3.0.5 have passed fresh-interpreter
array/groupby checks. This is evidence for those configurations, not arbitrary
native-wheel compatibility. Emscripten/Pyodide wheels are not interchangeable
with Dolly's process ABI.

`/etc/bonnie/build.toml`, defined by `modules/bonnie.dm`, supplies package
PEP 517 settings. Normalized package names select tables of strings or nonempty
string arrays. NumPy uses Meson's debug/no-CPU-optimization configuration to keep
generated sources within the browser compiler's resource budget.

Other packages keep upstream defaults. Bonnie owns serial compilation,
`build-dir` and `compile-args`; package policy cannot override these.
The bundled pip frontend runs in a child Python process. Logs and scratch live
in its transaction directory and are removed after completion. Full resolver
backtracking and a frozen public wheel/SOABI policy remain open.

## Git and HTTP

Git's HTTP helpers link Dolly's libcurl bridge, not sockets. Browser fixtures
cover v0/v2 clone/fetch, shallow/deepen, push/ref verification, damaged packs,
remote failures and cancellation. Pack/status sidebands spool to immediately
unlinked in-Wasm files for serial processing.

Ordinary signal handlers clean index locks. Forced Worker termination cannot
run handlers, so named files may remain. Configured clean/smudge filters still
need a port. Remote servers must allow browser Fetch/CORS; a token cannot bypass
CORS. See [HTTP](http.md).

## Deliberately unsupported

No native Node, arbitrary npm/native addons, nested JavaScript WebAssembly,
PTY/tmux, raw TCP/UDP or host subprocess fallback. Pi's Photon image resizer is
excluded because it requires nested Wasm; supported images pass through unchanged.

The system image includes source-built ripgrep and fd; Pi and Studio inherit
both. Runtime compatibility and reproducible failures belong in the
[audit handoff](audit-handoff.md).
