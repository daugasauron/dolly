# Source port decisions

This file records why a tool is present, deferred, or rejected. The standard is
not merely whether a program can be coerced into WebAssembly. A port must use
the private wasm64 process format, kernel-owned filesystem, and typed Dolly
gate; keep browser capabilities explicit; and have a reproducible source build.
Missing platform facilities become substrate work, not JavaScript or
host-process escape hatches.

## Current ports

| Program | Source and installation | Boundary exercised |
| --- | --- | --- |
| `ls`, `stat`, `file`, `test`, `[`, `mv`, `cp`, `install`, `which`, `command`, `xargs`, `find`, `du`, `dd`, `tail`, `tee`, `tty`, `env`, `printenv`, `rev`, `realpath`, `uname`, `hostname`, `time`, `timeout`, `diff`, `patch`, `download` | Small Dolly C sources; each compiled separately inside Dolly and found through `/bin` on `PATH` | Agent-observed file inspection/mutation and installation, PATH discovery and execution, serial argument batching, traversal, logical in-memory usage, bounded byte copying, finite stream selection/duplication, terminal detection, child-environment construction, deterministic platform identity, elapsed-time measurement, deadline-bounded execution, unified comparison/application, and explicit local export; `install` accepts conventional mode/owner/group options without creating permission or identity state; `find` provides deterministic no-follow traversal and serial `-exec`, while ownership/permission predicates fail explicitly; `env` executes through typed `spawn_env` without mutating the parent; `diff` and noninteractive `patch` delegate to the source-built Git; `du` reports logical bytes because Dolly has no disk allocation layer; `dd` supports finite byte/block copying without devices; `hostname` reports the fixed sandbox identity; `tail -f` and `tee -i` fail rather than inventing concurrency or signal policy |
| `grep`, `sed`, `head`, `wc`, `cut`, `od`, `printf`, `sort`, `uniq`, `basename`, `dirname`, `tr`, `cmp`, `comm`, `paste`, `join`, `seq`, `expr`, `nl`, `split`, `strings`, `cksum`, `fold`, `expand`, `unexpand`, `tsort`, `pathchk`, `date`, `mktemp`, `sha256sum`, `md5sum`, `sleep`, `true`, `false`, `ln`, `readlink`, `rmdir` | [Pinned sbase](../config/source-pins.sh); compiled in Dolly at boot | Multiple unchanged upstream C files, sorting/deduplication, regex, UTF-8 transforms, path splitting, comparisons, checksums, temporary paths, clocks, finite delay, symbolic links, files, stdin, flags, pipelines, byte inspection, and status composition. WasmFS currently supports `ln -s`/`readlink`, but not hard links; plain `ln` therefore fails locally rather than crossing the sandbox boundary |
| `awk` | [Pinned One True Awk and Bison](../config/source-pins.sh); parser generated reproducibly, then compiled in Dolly at boot | A generated-source build: upstream `maketab` is compiled as a private non-PATH command and executed to create `proctab.c` in WasmFS before the final command is linked; field separators, programs, files, pipes, CSV, and explicit subprocess denial are tested |
| `curl` / `libcurl.a` | [Pinned official curl headers](../config/source-pins.sh); Dolly's compatibility implementation and curl client are compiled in Dolly at boot | Normal `#include <curl/curl.h>` and `-lcurl`; methods, headers, bodies, callbacks, response metadata, and a synchronous multi API over one typed Fetch broker |
| `gzip` | Dolly's decompression-only C frontend is compiled in Dolly against its source-built pinned zlib | `gzip -dc` turns ordinary `.tar.gz`/`.tgz` inputs into a tar stream entirely in WasmFS; compression and the broad GNU gzip CLI intentionally fail rather than claim compatibility |
| `git` | [Pinned Git and zlib](../config/source-pins.sh); GNU Make compiles upstream sources with a mapped-spawn and serial sideband-receive port | Local init/config/add/commit/log; HTTP v0/v2 clone/fetch, push, checkout/ref updates, shallow/deepen, damaged-pack rejection and transfer cancellation through the single broker; normal exit and cooperative signals clean index locks |
| `make` | Checksum-pinned upstream GNU Make 4.4.1; configured and patched as an exact source manifest, then compiled in Dolly at boot | Real dependency evaluation, automatic variables, `$(shell ...)`, separate compilation and linking, up-to-date checks, and accepted-but-serial `-jN`; every recipe enters `/bin/slop -c`, while every tool invocation gets private process state |
| `ninja` | Commit-pinned upstream Samurai 1.3 C99 sources with one reviewed Dolly scheduler patch; its 13 ordinary translation units are compiled in Dolly at boot | Ninja build-file parsing, dependency graphs, dirty checks, depfiles, response files, and build logs; ready edges execute synchronously through `/bin/slop -c`, while `-jN` is accepted but intentionally serial |
| `qjs`, `janis` | [Pinned QuickJS-ng](../config/source-pins.sh); unchanged engine sources plus `src/runtimes/quickjs-main.c`, all compiled in Dolly at boot | A large current C runtime, exact ECMAScript math, allocator and clock surface, source files, stdin, arguments, exception status, repeated invocation, and finite WasmFS-only bare ESM resolution with confined `package.json` exports |
| `tsc` | Digest-pinned official TypeScript 5.9.3 npm archive is decompressed by Dolly and the unchanged compiler runs under Janis | Single-/multi-file ESM emit in WasmFS plus complete `noCheck` emit of 495 modules across Pi's seven pinned runtime workspace packages; no host Node/filesystem/network capability and no claim of full type checking |
| `pi` | Exact pinned Git source for seven upstream workspace packages is emitted by `/usr/bin/tsc` inside Dolly; `/usr/bin/pi` is separately compiled against source-built QuickJS/Janis and loads that unbundled graph plus a 31-package lockfile-verified external profile from WasmFS; one asserted six-regex post-emit lowering covers QuickJS-ng's current Unicode-set gap | Full upstream TUI through in-Wasm Ghostty, mode-aware ESM/CommonJS/JSON resolution, pasted OpenRouter credentials persisted in WasmFS with model discovery, completed Codex PKCE/manual-code exchange, real and fixture streaming through the sole HTTP broker, Dolly Slop/WasmFS tools, and extension installation/reload; the source-built CLI itself passes an actual OpenRouter tool-use/install turn, with no host application bundle or ambient package download |
| `python`, `python3` | Pinned upstream CPython 3.14 is configured for the wasm64 target outside the browser, then all target objects and the executable are compiled by GNU Make inside Dolly | A large C runtime sharing WasmFS, Dolly entropy, clocks, locale, zlib, writable user-site paths, and explicit single-thread compatibility; it identifies as `sys.platform == "dolly"` so packages do not assume Pyodide's ambient `js`, `_socket` imports but every raw network operation fails locally with `ENOSYS`, and upstream `termios` controls the small in-Wasm terminal mode contract |
| `bonnie` | Dolly C frontend plus a retained Python resolver compiled in the Python image and linked to the source-built Fetch-backed libcurl | Resolves complete runtime and PEP 517 build-requirement graphs, verifies and stages wheels/source distributions transactionally, builds native extensions with Dolly's C/C++ toolchain, and publishes only after preparation; `list`, `freeze`, `show`, and `check` inspect installed metadata. Full backtracking and arbitrary native-package compatibility remain explicit gaps |
| `raylib`, `Box3D`, `graphics-demo` | Pinned upstream raylib 6.0 and Box3D 0.1.0 plus Dolly presentation and serial-task adapters and a 3D game source; all objects and archives compile inside the gamedev image | Upstream no-OS software rendering, real C17 3D rigid-body physics, bounded logical framebuffer sizing, animation-frame pacing, semantic cursor/input, finite frame checks, and terminal restoration without DOM, WebGL, sockets, pthreads, or a new browser import |
| `cc`, `c++`, `ld`, `ar` | Current pinned Clang/LLD/LLVM linked into one private compiler executable, independent of Zig; separate source-compiled command frontends | Source/object/archive compilation, stdin/file preprocessing and macro dumps, C17/C++23, multi-object and `-L`/`-l` links, deterministic GNU archives, exact import validation, and ABI stamping; each invocation receives a fresh Worker, memory, allocator, and LLVM state while file publication crosses the typed process gate |

Bonnie reads upstream PEP 517 config-settings from `/etc/bonnie/build.toml`,
defined in `modules/bonnie.dm`. Tables use normalized package names; each key
accepts a string or nonempty string array. The default NumPy table selects
Meson's debug build and disables CPU optimization so generated ufunc sources
do not override `CFLAGS` with an expensive `-O3`. Editing or removing that file
changes package policy without editing Bonnie. Other packages get their upstream
defaults; Bonnie still supplies serial Meson compilation and owns its scratch
directory. Its `build-dir` and `compile-args` settings cannot be overridden by
package policy. Invalid policy fails before creating build temporary state.
The bundled pip frontend runs as a child Python process inside Dolly, using its
CLI rather than its private in-process API. Bonnie keeps its log and temporary
files in one transaction directory and removes it after the child exits.

QuickJS-ng's `quickjs-libc.c` is intentionally excluded. It exposes native
`fork`, `exec`, `popen`, `dlopen`, signals, polling, and raw-terminal functions.
The engine itself needs none of those. Dolly's adapter exposes only execution,
arguments, and output, so later process operations or Node-shaped APIs can be
added one capability at a time.

Foreground cancellation is nevertheless part of Dolly's own lifecycle layer.
`Ctrl+C` targets the active in-Wasm process tree, blocking
terminal/HTTP/sleep operations poll explicitly, and QuickJS uses its interpreter
interrupt hook. A trusted timer terminates a Worker that does not cooperate, so
even a pure C/C++ CPU loop returns status 130 without compiler instrumentation.
This is not general POSIX signal-handler or process-group emulation.

## Deferred ports

### Git filters

Ordinary HTTP clone/fetch/push now uses private child processes and real bounded
pipes. Sideband receive spools into an immediately unlinked in-Wasm file before
indexing, trading pack-sized temporary storage for a simple serial path. The
browser fixture validates both protocol versions with a pack larger than the
pipe buffer; its native Git is only the remote reference HTTP server.
Remote servers must permit browser Fetch/CORS. The port adds no proxy or
browser-policy exception.

Push receives its sideband status into a second unlinked spool after sending
the pack. Configured clean/smudge filters still need an upstream callback port.
No general `fork`, process replacement, daemon, or raw-socket support is implied.
Git's ordinary signal handlers now clean interrupted index locks. Forced Worker
termination cannot run handlers; its named files may remain, while the unlinked
pack/status spools cannot leave a pathname. Browser redirect policy remains
independently enforceable.

### Vim: source-build probe

Vim's official [terminal documentation](https://github.com/vim/vim/blob/master/runtime/doc/term.txt)
requires raw character input, terminal capability strings, and window size.
Dolly now provides the raw/canonical tty substrate used by Pi. Vim has
not yet been attempted against it; the next step is an unchanged small Unix
build rather than an `ex`-only or screen-disabled substitute.

Acceptance gate: evaluate the unchanged small Unix build with Dolly's existing
`isatty`, window size, raw/canonical restoration, and interrupt delivery from Vim's
[source instructions](https://github.com/vim/vim/blob/master/src/INSTALL).

### Nested JavaScript WebAssembly: image processing

Janis does not currently expose JavaScript's `WebAssembly` API. Pi's optional
Photon image processor is a wasm32 module whose CommonJS wrapper synchronously
constructs `WebAssembly.Module` from `photon_rs_bg.wasm`. A real in-browser
probe resolves that wrapper from Dolly's WasmFS and fails at the constructor,
not at filesystem or package resolution.

The default Pi settings consequently disable automatic image resize and the
runtime package archive omits Photon. Supported image formats still pass
through as ordinary model input. Any future nested-Wasm solution must remain
inside the Dolly userspace boundary, use WasmFS bytes, receive no ambient
browser imports, and have explicit resource-limit and cancellation tests.

### CPython follow-up

Implemented in the Python image: pinned CPython 3.14 target objects and the
interpreter compile inside Dolly as wasm64 and use the shared WasmFS. A narrow
target patch gives it the honest `dolly` platform identity while preserving
the exact no-fork, Wasm-library, UUID, and no-pager decisions required by this
substrate. Requests and Pytest now import after installation without a Pyodide
`js` shim or a second network edge; actual socket construction fails explicitly.
Upstream `faulthandler` is built in and supports enable/disable and synchronous
traceback dumps; its OS core-dump suppression is excluded because Dolly has no
resource limits, and delayed dumps explicitly fail at the existing no-thread
boundary. Upstream `termios` and `tty` are also built in through a
CPython-specific adapter over Dolly's terminal discipline bits and in-Wasm window
dimensions. Ctrl+C remains unconditional lifecycle supervision even in raw
mode. The adapter adds no browser import; command lifecycle
restoration prevents a runtime that exits or is interrupted in raw mode from
stranding the shell. Process-local dynamic loading and source-built libffi now
support `_ctypes`, C and C++ extension modules, and Dolly-native wheels. Real
kernel-owned close-on-exec flags and descriptor inheritance now support
`close_fds=False` and `pass_fds`, including Meson-shaped compiler detection in
the browser. A clean `bonnie install pandas` built NumPy 2.5.2 and Pandas 3.0.5
through unchanged Meson 1.12.0; fresh Python array/groupby checks passed, staging
was removed and raw sockets remained denied. Meson
source builds are deliberately single-job: parallel compiler
Workers multiply WebAssembly memories without improving the compatibility
contract. Bonnie also selects NumPy's supported no-CPU-optimization/debug
configuration with release assertions disabled, keeping its generated ufunc
translation units within the browser compiler's resource envelope without
patching upstream source. Remaining work is broader extension-module coverage,
a frozen public wheel/SOABI policy, and expanding Bonnie's resolver without
pretending unsupported packages work.

### Zig and `libghostty-vt`: compiler bootstrap

Implemented. A checksum-pinned official Zig stage zero compiles the pinned
upstream Zig 0.16.0 frontend as an ABI-validated wasm64 command. Native
`/usr/bin/zig` runs inside Dolly and emits relocatable WebAssembly objects
through its own linked LLVM WebAssembly backend.
It compiles the pinned Ghostty VT and uucode graph into
`/usr/lib/libghostty-vt.a` and the resident display module. A cold-browser proof
compiles the graph, feeds VT bytes to the public C
API, and inspects the resulting cell grid.

Clang/LLD and Zig are separate private process executables. The `ghostty-build`
image retains Zig and builds the terminal; the system image copies only its
display plugin, font and licenses. Every invocation receives a fresh Worker, memory, table,
allocator, and LLVM state while its inputs and outputs cross the typed process
gate into the kernel filesystem. Browser regressions pass optimized repeated
Clang jobs, mixed Clang/Zig orderings, and independent Zig code generation
without promoting `ZigLLVM*` functions into the stable Dolly substrate.

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

## Native agent compatibility investigation

As checked on 2026-09-06, this is separate from Pi's working Codex-provider login.
No native Claude Code or Codex image is advertised as working.

- Codex 0.153.4's unchanged npm launcher was executed by Janis in a real Dolly
  browser session. It exited 1: `Unsupported platform: wasm (wasm64)`. Its
  application is Rust, not the small JavaScript launcher. The
  [pinned core manifest](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/core/Cargo.toml)
  includes Tokio process/signal/multithread execution, PTY support and HTTP clients.
  A source `cargo check` at commit `3d2ee51` first hit Mio's unsupported target;
  selecting its existing poll/pipe backend now passes an isolated browser probe.
  The next full-source attempt stops at native OpenSSL discovery. Those clients
  need an explicit broker-backed HTTP port, not host sockets. Local evidence:
  `build/rust-port.3xZ2cO/codex-check-{3,4}.log`.
- Claude Code 2.1.263 is distributed as native platform binaries; the inspected
  installed executable is x86-64 ELF. The [installation documentation](https://code.claude.com/docs/en/setup)
  confirms npm installs the same native executable rather than a Node application.
  An old JavaScript release would be a different, explicitly labeled experiment,
  not evidence of current-version compatibility.

A credible Codex port starts with Rust's standard library and dependencies
targeting Dolly's existing process ABI. Rust's generic
[wasm64 target](https://doc.rust-lang.org/rustc/platform-support/wasm64-unknown-unknown.html)
does not provide working filesystem/network I/O or a ready Dolly libc integration.
An isolated Rust 1.98.1 target now links through Dolly's own `cc` and runs a
normal Rust `main` in Chrome. C/Rust layouts, Unicode arguments, allocation,
filesystem metadata, clocks, child env/cwd/status and captured stdout/stderr
passed twice, including 256 KiB on each child stream. This required corrected
Emscripten libc bindings, standard-library process selection, an experimental
in-Wasm POSIX-spawn adapter, and the target's `__main_argc_argv` entry name.
Rust objects and `std` were cross-compiled externally; this is not a shipped
Rust SDK or a Rust compiler running inside Dolly. Local evidence:
`build/rust-port.3xZ2cO/std-main-published-browser.log`.
Mio 1.2.0's existing Unix backend also passes repeated pipe readiness/re-arming,
wake/reset and EOF checks (`build/rust-port.3xZ2cO/mio-browser.log`). Its local
patch selects existing implementations; this does not provide Tokio threads
or a socket transport. Unmodified Tokio 1.52.3 separately passes single-threaded
tasks, timers, bounded channels and timeouts
(`build/rust-port.3xZ2cO/tokio-browser.log`).
Unmodified `curl-sys` 0.4.90 bindings also link against Dolly's source-built
libcurl and pass binary POST, header and response callbacks in Chrome
(`build/rust-port.3xZ2cO/http-sys-browser-1.log`). Cargo's target build-script
overrides defer native-library linking to Dolly; they supply no host transport.
The higher-level `curl` 0.4.50 crate compiles but does not link unchanged: its
handle destructor requires `curl_formfree`. Its constructor also requires seek,
progress and socket callbacks that Dolly does not implement. No fake multipart
or socket support was added to satisfy it.
An actual Codex HTTP port must use the broker-backed path; execution and
terminal state must stay inside Wasm. Current native packages cannot simply be
copied into `/bin`. No host imports, native process fallback, platform spoofing,
raw sockets, or weakened admission checks were added for this investigation.

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
