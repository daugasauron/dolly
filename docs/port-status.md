# Source port decisions

This file records why a tool is present, deferred, or rejected. The standard is
not merely whether a program can be coerced into WebAssembly. A port must use
the shared wasm64 machine, WasmFS, and typed Dolly contract; keep browser
capabilities explicit; and have a reproducible source build. Missing platform
facilities become substrate work, not JavaScript or host-process escape hatches.

## Current ports

| Program | Source and installation | Boundary exercised |
| --- | --- | --- |
| `ls`, `stat`, `file`, `test`, `[`, `mv`, `cp`, `download` | Small Dolly C sources; each compiled separately inside Dolly and found through `/bin` on `PATH` | Agent-observed file inspection/mutation and explicit local export; `cp` handles files, symlinks, multiple operands, and recursive trees without introducing permission semantics |
| `grep`, `sed`, `head`, `wc`, `printf` | [Pinned sbase](../config/source-pins.sh); compiled in Dolly at boot | Multiple unchanged upstream C files, regex, UTF-8 helpers, files, stdin, flags, pipelines, and repeatable static state |
| `awk` | [Pinned One True Awk and Bison](../config/source-pins.sh); parser generated reproducibly, then compiled in Dolly at boot | A generated-source build: upstream `maketab` is compiled as a private non-PATH command and executed to create `proctab.c` in WasmFS before the final command is linked; field separators, programs, files, pipes, CSV, and explicit subprocess denial are tested |
| `curl` / `libcurl.a` | [Pinned official curl headers](../config/source-pins.sh); Dolly's compatibility implementation and curl client are compiled in Dolly at boot | Normal `#include <curl/curl.h>` and `-lcurl`; methods, headers, bodies, callbacks, response metadata, and a synchronous multi API over one typed Fetch broker |
| `git` | [Pinned Git and zlib](../config/source-pins.sh); GNU Make compiles 427 upstream library/builtin sources in Dolly with three Dolly lifecycle cleanup adaptations | Real init/config/add/commit/log in shared WasmFS; deterministic archives and `-l` linking; upstream HTTP/HTTPS helpers linked with `-lcurl`; protocol-v2 discovery through the single browser broker |
| `make` | Checksum-pinned upstream GNU Make 4.4.1; configured and patched as an exact source manifest, then compiled in Dolly at boot | Real dependency evaluation, automatic variables, `$(shell ...)`, separate compilation and linking, up-to-date checks, and accepted-but-serial `-jN`; every recipe enters `/bin/slop -c` |
| `qjs` | [Pinned QuickJS-ng](../config/source-pins.sh); unchanged engine sources plus `src/runtimes/quickjs-main.c`, all compiled in Dolly at boot | A large current C runtime, exact ECMAScript math, allocator and clock surface, source files, stdin, arguments, exception status, and repeated invocation |
| `pi` | Pinned upstream Pi packages are bundled with asserted QuickJS compatibility lowerings and Pi's upstream standalone OAuth loader table; `/usr/bin/pi` is compiled in Dolly against source-built QuickJS and Janis | Full upstream TUI through in-Wasm Ghostty, pasted OpenRouter credentials persisted in WasmFS with model discovery, completed Codex PKCE/manual-code exchange with sandbox credential persistence and model discovery, real/fixture streaming providers through the sole HTTP broker, a normal extension overriding Slop/WasmFS tools, and dependency-free extension installation/reload; in-Dolly TypeScript source build remains deferred |
| `python`, `python3` | Pinned upstream CPython 3.14 is configured for the wasm64 target outside the browser, then all target objects and the executable are compiled by GNU Make inside Dolly | A large C runtime sharing WasmFS, Dolly entropy, clocks, locale, zlib, and explicit single-thread compatibility; `pathlib` mutation is checked during every image rebuild |
| `graphics-demo` | Small Dolly C source retained with its Makefile in the gamedev image and compiled inside Dolly | Direct exclusive framebuffer lease, double-buffered RGBA rendering, semantic input, finite automated frame count, and terminal restoration after return or Ctrl-C; retained source is a target-side starter for agent-created games |
| `cc`, `c++`, `ld`, `ar` | Current pinned Clang/LLD linked into the trusted runtime; separate source-compiled command frontends | Source/object/archive compilation, C17/C++23, multi-object and `-L`/`-l` links, deterministic GNU archives, exact import validation, ABI stamping, and direct WasmFS publication |

QuickJS-ng's `quickjs-libc.c` is intentionally excluded. It exposes native
`fork`, `exec`, `popen`, `dlopen`, signals, polling, and raw-terminal functions.
The engine itself needs none of those. Dolly's adapter exposes only execution,
arguments, and output, so later filesystem modules or Node-shaped APIs can be
added one capability at a time.

Foreground cancellation is nevertheless part of Dolly's own lifecycle layer.
`Ctrl+C` targets the active in-Wasm PID, C/C++ commands poll at compiler-inserted
control-flow edges, blocking terminal/HTTP/sleep operations poll explicitly,
and QuickJS uses its interpreter interrupt hook. The current result is the
default `SIGINT` action and shell status 130, not general POSIX signal-handler or
process-group emulation.

## Deferred ports

### Git clone: helper protocol integration

Git is a family of cooperating commands, not one leaf executable. The archive,
zlib, local-filesystem, general HTTP, libcurl, and direct smart-HTTP helper
milestones now work. A normal `git clone https://...` still expects
`/usr/bin/git` and `git-remote-http` to exchange a bidirectional protocol over
concurrent pipes. Dolly's version-0 `spawn` deliberately completes one
filesystem module synchronously, and native `fork`/`exec` wrappers return
`ENOSYS`.

Acceptance gate: first try the smallest Git-specific in-Wasm integration or a
serial/spooled protocol adapter, then prove clone/fetch through the existing
browser HTTP broker. A general scheduler is not a prerequisite and should not
be introduced merely to imitate Unix. No host process or socket fallback is
acceptable.

### Vim: source-build probe

Vim's official [terminal documentation](https://github.com/vim/vim/blob/master/runtime/doc/term.txt)
requires raw character input, terminal capability strings, and window size.
Dolly now provides the raw/canonical tty substrate used by Pi. Vim has
not yet been attempted against it; the next step is an unchanged small Unix
build rather than an `ex`-only or screen-disabled substitute.

Acceptance gate: evaluate the unchanged small Unix build with Dolly's existing
`isatty`, window size, raw/canonical restoration, and interrupt delivery from Vim's
[source instructions](https://github.com/vim/vim/blob/master/src/INSTALL).

### CPython: wasm64 and build bootstrap

Python 3.14 officially supports
[`wasm32-unknown-emscripten`](https://docs.python.org/3.14/whatsnew/3.14.html),
not Dolly's hard-required wasm64 target. Its build also uses configure/make and
build-Python generators for frozen modules. Treating a wasm32 interpreter as a
separate nested machine would break the shared pointer and filesystem model.

Acceptance gate: upstream or maintainable toolchain support for CPython on
`wasm64-unknown-emscripten`, followed by a reproducible two-machine build graph
using Dolly's working Make/Slop path and standard-library filesystem tests.
QuickJS already provides a smaller runtime probe while that work matures.

### Zig and `libghostty-vt`: compiler bootstrap

Implemented. A checksum-pinned official Zig stage zero compiles the pinned
upstream Zig 0.16.0 frontend as an ABI-validated wasm64 command. Native
`/usr/bin/zig` runs inside Dolly and emits relocatable WebAssembly objects
directly through a typed bridge to the runtime's LLVM WebAssembly backend.
It compiles the pinned Ghostty VT and uucode graph into
`/usr/lib/libghostty-vt.a`, `/usr/bin/ghostty-vt`, and the resident display
module. A cold-browser proof compiles the graph, feeds VT bytes to the public C
API, and inspects the resulting cell grid.

This is intentionally the `libghostty-vt` terminal core, not the GTK/macOS
desktop application. Exact architecture and evidence are in
[`zig-ghostty.md`](zig-ghostty.md).

## Rejected literal port

### Node

Literal Node brings V8, whose target architectures do not include WebAssembly.
Embedding a separately sandboxed wasm32 runtime or forwarding Node's `fs` and
`child_process` APIs to JavaScript would violate Dolly's shared wasm64 machine
and explicit capability boundary. `/usr/bin/qjs` is the current JavaScript
language runtime. Node compatibility, if useful to an agent workload, should be
implemented as selected modules over Dolly facilities—for example filesystem
access over WasmFS and subprocess calls over Dolly lifecycle—not as a claim that
QuickJS is Node. The staged compatibility and source-build work for Pi is
tracked in [`pi-agent-plan.md`](pi-agent-plan.md).

## Next substrate order

The project-wide sequencing and acceptance gates now live in
[`roadmap.md`](roadmap.md); the list below is the port-specific rule of thumb.

1. Use upstream source builds as probes and extend Slop only for syntax that a
   useful agent tool actually requires.
2. Add small synchronous lifecycle adapters where tools assume `fork`/`exec`;
   prefer serial execution and WasmFS spooling over a scheduler.
3. Generalize reproducible target-side source generators only when Make cannot
   express the required build graph cleanly.
4. Run TypeScript and the next source/package probes through Janis; add only
   compatibility demonstrated by those workloads.
5. Preserve the implemented bounded RGBA/input ABI and extend the in-Dolly
   Ghostty renderer only for gaps exposed by useful agent TUIs.
6. Consider concurrency, performance work, or async APIs only after a concrete
   compatibility requirement cannot be met with the simpler model.
