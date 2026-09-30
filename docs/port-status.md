# Port status

The image's Dollyfile determines installed tools; `command -v TOOL` checks
the running environment. Exact revisions and preparation live in
[config/source-pins.sh](../config/source-pins.sh), the npm lockfile and pinned
modules. This page records compatibility, not a second source inventory.

| Family | Current support | Important limits |
| --- | --- | --- |
| Slop and core/sbase tools | Separate PATH executables, basic shell scripts and conventional text/file tools | [Slop](slop.md) is not Bash |
| C/C++ | Private Clang/LLD compiler, objects, archives, C++ libraries and process-local DSOs | No native host target, fork or threads |
| Rust / Patti | Seed compiler runs in Dolly; C Patti builds ripgrep, fd, Protox and Codex from source in-browser | Serial target adaptations; external compiler seed; `demos/rust` |
| Codex | Real TUI, shell tools and device-code login | Current-thread Tokio; model endpoints require browser CORS; `demos/codex` |
| Make / Ninja | Source-built GNU Make and Samurai; Slop recipes and dependency tracking | `-jN` accepted but serial |
| Git / curl | Local Git plus HTTP clone/fetch/push; Fetch-backed libcurl | CORS applies; no sockets; Git clean/smudge filters unported |
| Lua / QuickJS / Janis | Source-built runtimes sharing WasmFS | Janis is a finite Node subset (`demos/javascript`), not native Node |
| TypeScript / Pi | Official tsc runs in Dolly; upstream Pi packages emitted and loaded there | `noCheck` emit, no npm client/native addons; `demos/pi` |
| Python / Bonnie | Source-built CPython, package resolution, wheels and C/C++ extension builds | No raw sockets or parallel threads; package compatibility is finite |
| Neovim | Source-built editor, Dollyfile highlighting/linting in Studio, Slop shell commands | No PTY `:terminal`, tmux or LuaJIT FFI; `demos/neovim` |
| raylib / Box3D | Software-rendered 2D/3D games and real 3D rigid-body physics | No DOM/WebGL; serial physics; [display API](display.md) |
| SDL2 / Seven Kingdoms | Source-built CPU rendering, input and two Pi players in `demos/rts` | No audio/threads; remote model APIs require CORS |
| 0 A.D. Release 28 | Real wasm64 engine, two selected scenarios, Athens/Petra economy, hardware WebGPU in Chrome/Firefox, audio, deterministic save continuation, replay/control and a two-peer relay match; `demos/zero-ad` | External engine bootstrap; selected content; buffered audio latency; slow HTTP multiplayer; no lobby/native peers/network rejoin |
| Zig / Ghostty | Separate private Zig compiler; source-built VT renderer | Builder image only; system copies finished display artifacts |

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

Pi, Studio and Codex images include source-built ripgrep and fd. Runtime compatibility and reproducible failures belong in the
[issue tracker](../tasks/README.md).
