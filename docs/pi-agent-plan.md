# Pi agent compatibility plan

Status: headless Pi implemented; interactive TUI and source build planned  
Last updated: 2026-08-29

## Implemented baseline

The first useful Pi slice now works in the production browser path:

- `/usr/bin/pi` is a normal Dolly filesystem executable found through `PATH`;
- it runs a pinned, Dolly-specific ESM bundle containing upstream Pi agent-core
  and Pi's OpenAI-compatible provider adapter on source-built QuickJS-ng;
- the JavaScript compatibility layer exposes only selected Node-shaped behavior
  over WasmFS, Dolly lifecycle calls, and `dolly_http_perform`;
- Pi's `read`, `write`, and `bash` tools operate on shared WasmFS, with `bash`
  entering `/bin/slop -c`;
- `pi --version`, `pi --help`, `pi --self-test`, and headless `pi -p` work;
- the browser integration test drives an actual streaming Pi provider adapter,
  a tool call, a WasmFS write, a Slop command, a second model request containing
  the tool result, and the final response through `env.dolly_http_dispatch`.

This is intentionally a lean compatibility entry, not yet Pi's complete
upstream CLI or terminal UI. Its purpose is to prove the real agent loop and
measure the next APIs. The exact current implementation is summarized in
[`port-status.md`](port-status.md), and the Zig/Ghostty investigation is in
[`zig-ghostty.md`](zig-ghostty.md).

## Outcome

Dolly should run a pinned upstream Pi agent in the browser with its useful
coding-agent behavior intact:

- model requests cross only Dolly's existing browser-owned HTTP broker;
- files, package contents, configuration, command state, and tool output remain
  in WasmFS;
- shell tools execute as filesystem modules through Dolly lifecycle operations;
- the implementation uses serial and synchronous behavior wherever observable
  compatibility does not require concurrency;
- TypeScript and Pi are eventually built from pinned source inside Dolly;
- no Node process, host filesystem, socket, browser `fetch`, DOM, or JavaScript
  evaluation capability is forwarded into the sandbox.

The purpose is not to recreate Node or Linux. Pi is the real workload used to
discover the smallest JavaScript-agent userspace interface that Dolly needs.

## Decisions

1. QuickJS-ng remains the JavaScript engine. Literal Node/V8 is not the target.
2. Node compatibility is a finite library over Dolly facilities, not a browser
   API and not a claim that QuickJS is Node.
3. The published Pi JavaScript bundle is an initial compatibility probe. It is
   not the final source-build story.
4. A TypeScript compiler comes after JavaScript module loading and the measured
   Node-compatible surface. Compiling TypeScript first would only produce
   JavaScript that Dolly cannot yet load.
5. Promise-shaped APIs may be backed by blocking Dolly operations. Version 0
   remains single-threaded and deterministic.
6. `libghostty-vt` and the RGBA display driver now build and link inside Dolly
   through the source-only Zig bootstrap. The browser is a narrow framebuffer
   presenter and raw event source; Pi TUI work still needs the tty-control APIs.
7. Canonical contracts remain WAT, C headers, C/JavaScript source, and prose.
   No new JSON contract or package manifest is introduced merely for this work.

## Ghostty and the display boundary

### Implemented arrangement

Dolly now uses a framebuffer-console-shaped architecture:

```text
keyboard / resize events
          |
          v
versioned input mailbox in shared memory
          |
          v
Dolly tty discipline -> foreground program
          |
          v
stdout/stderr VT bytes -> libghostty-vt inside Dolly
          |
          v
Iosevka glyph rasterization into RGBA in Dolly memory
          |
          v
checked browser canvas blit
```

The browser presenter receives a buffer index, dimensions, stride, generation,
and pixels for Dolly's dedicated canvas. It does not receive a filesystem path,
URL, command name, arbitrary DOM selector, JavaScript source, or graphics-
resource URL. Input is a fixed-size versioned record ring for raw key,
text/IME and resize events.

Under Dolly's threat model, compromising the in-Wasm VT engine can corrupt the
screen and emit arbitrary pixels. That is acceptable: terminal output is
already an explicit local-user-visible channel. It must not grant network,
host-filesystem, native-process, clipboard-write, or general DOM authority.

The target remains `libghostty-vt`, not the complete Ghostty desktop
application. The in-Wasm responsibilities are now:

- VT/ANSI parsing;
- terminal modes and cursor state;
- cell grid and scrollback;
- grapheme and cell-width state;
- alternate-screen state;
- terminal-mode-aware keyboard protocol encoding;
- Iosevka TTF loading and glyph rasterization;
- bounded double-buffered RGBA publication.

DOM event capture, IME composition, fullscreen requests, device-pixel ratio,
accessibility, and the final canvas blit remain necessarily browser-facing. The
chosen RGBA design gives a smaller privileged surface than a browser cell/font
renderer at the cost of full-frame copies. Selection and richer shaping are not
implemented yet.

Importing a large Canvas or WebGL method surface into Dolly is rejected. It
would replace a small terminal contract with a broad browser graphics ABI and
would still not make the browser disappear.

### Source-build feasibility result

Ghostty is implemented in Zig, and an upstream Ghostty release requires a
specific Zig compiler version. The official build documentation records this
coupling: [building Ghostty from source](https://ghostty.org/docs/install/build).
Upstream exposes a C-consumable `ghostty-vt` static library, but Zig still
builds that library: [Ghostty CMake integration](https://github.com/ghostty-org/ghostty/blob/main/CMakeLists.txt).

Current Ghostty `main` at commit
`4540d499ae463ad7b90f28f6f852f64f844c160f`, using Zig 0.16.0, successfully
cross-builds `libghostty-vt` for `wasm64-freestanding` with upstream's supported
`-Dvt-features=-kitty_graphics` option. The resulting standalone module is
about 868 KB. The default feature set fails only in Kitty graphics' file and
shared-memory image transports, which are unnecessary for Dolly's first text
terminal. This establishes that Ghostty itself is not fundamentally wasm32-only.

That feasibility path is now implemented without packaging the standalone
module. Dolly source-builds a WAMR-backed Zig bootstrap, translates Ghostty to
C inside WasmFS, compiles it as a wasm64 archive in the shared userspace, and
links a command that proves a fixed VT byte stream produces an inspectable cell
grid. The detailed architecture and cold-browser evidence are in
[`zig-ghostty.md`](zig-ghostty.md).

Ghostty integration does not block the headless Pi milestones. The in-Wasm RGBA
path has replaced the external renderer after Chrome presentation and input
tests passed.

## Target JavaScript architecture

```text
Pi TypeScript sources
        |
        v
TypeScript compiler inside Dolly
        |
        v
Pi ESM JavaScript + JavaScript dependencies in WasmFS
        |
        v
QuickJS-ng module loader
        |
        +--> selected node:* modules implemented inside QuickJS/Dolly
        |       +--> WasmFS
        |       +--> Dolly clocks and entropy
        |       +--> Dolly spawn/wait and Slop
        |       `--> Dolly HTTP client
        |
        v
Dolly command ABI and shared wasm64 userspace
        |
        +--> terminal/display device
        `--> env.dolly_http_dispatch (sole autonomous network edge)
```

No `node:*` module should add a browser import. Node-shaped modules translate
JavaScript behavior to existing in-Wasm facilities. If a compatibility feature
cannot be implemented that way, it fails explicitly.

## Definition of support

Pi support is complete in increasing levels. Each level remains tested after
the next is added.

| Level | Result | Status |
| --- | --- | --- |
| P0 | The pinned published Pi bundle loads far enough to produce an exact missing-API inventory. | Done |
| P1 | `pi --version` and `pi --help` execute from WasmFS. | Done |
| P2 | A headless prompt completes through one browser-approved model provider. | Done with the real Pi streaming adapter and a browser fixture; live-provider policy remains embedding configuration |
| P3 | Pi reads and writes files in `/workspace`. | Done; edit remains future surface |
| P4 | Pi runs a shell tool through `/bin/slop -c` and receives output/status. | Done |
| P5 | Pi's noninteractive CLI mode works through `/usr/bin/pi` without a browser-side launcher. | Done for Dolly's lean CLI entry |
| P6 | Pi's interactive terminal UI works with raw input and resize handling. | Planned |
| P7 | The TypeScript compiler runs inside Dolly and builds pinned Pi sources. | Planned |
| P8 | A documented subset of Pi packages/extensions can be loaded from WasmFS. | Planned |

The first useful goal is P4. P6, P7, and P8 must not delay proving the agent
loop and tool boundary.

## Work packages

### 0. Freeze the probe and measure it

- Select one exact Pi release/commit and record its archive checksum alongside
  Dolly's other source pins.
- Package the official built JavaScript as a temporary probe under
  `/usr/src/pi-probe`, not as the final `/usr/bin/pi` implementation.
- Statically enumerate imports, `node:*` modules, globals, package lookups,
  dynamic imports, native addons, environment variables, terminal calls, and
  subprocess calls.
- Run the bundle after every loader improvement and record the next actual
  failure.
- Keep the human-reviewed inventory in Markdown. Generated scratch data may be
  JavaScript if a build tool needs it.

Acceptance gate: the pinned input and its complete initial compatibility
surface are reproducible, and unsupported optional areas are named rather than
implicitly stubbed.

Known likely deferrals include native image processing, runtime installation of
arbitrary npm packages, Pi extensions loaded through `jiti`, proxy/socket
agents, and background subprocesses. The inventory decides the exact list.

### 1. Make QuickJS an ESM filesystem runtime

- Add QuickJS module normalization and loading hooks.
- Read `.js` and `.mjs` modules only from WasmFS.
- Resolve relative and absolute paths deterministically.
- Add the measured subset of package-directory, `package.json`, `exports`, and
  `type: module` behavior. Do not implement unused Node resolution rules.
- Represent `node:*` builtins as synthetic QuickJS modules registered by the
  runtime.
- Preserve `qjs -e`, file, stdin, arguments, errors, and repeated invocation.
- Set memory and stack ceilings and produce useful module-resolution errors.

Acceptance gate: a multi-file ESM fixture imports relative modules and one
synthetic builtin from WasmFS, twice, without state leaking between command
invocations.

### 2. Implement the synchronous Node foundation

Start with only the surface demonstrated by the Pi probe. Expected modules and
translations are:

| JavaScript surface | Dolly implementation |
| --- | --- |
| `process` | argv, env, cwd/chdir, exit status, platform constants, standard streams |
| `Buffer` | QuickJS array buffers and explicit byte/string conversions |
| `node:fs` | libc/WasmFS files, descriptors, directories, and metadata |
| `node:fs/promises` | already-settled promises around the same synchronous operations |
| `node:path` | pure path manipulation with Dolly POSIX rules |
| `node:url` | pure URL and file-URL manipulation; no fetch authority |
| `node:util` | only measured formatting, inspection, encoding, and callback helpers |
| `node:events` | in-JavaScript event emitter behavior |
| `node:os` | fixed sandbox facts and Dolly temp/home directories |
| `node:crypto` | Dolly entropy plus measured hash/HMAC/UUID operations inside Wasm |
| `node:module` | measured builtin/package-resolution introspection only |

`process.binding`, native addons, N-API, raw sockets, worker threads, host
signals, and host environment discovery remain unavailable.

Acceptance gate: focused compatibility tests exercise each implemented symbol,
and a negative test proves neighboring unsupported symbols fail clearly.

### 3. Add a deterministic JavaScript event pump

- Continue draining QuickJS's Promise jobs.
- Add one serial queue for deferred callbacks and timer records.
- Implement the measured `queueMicrotask`, `setTimeout`, `clearTimeout`,
  `setInterval`, and abort behavior.
- Advance by the next due event; never add threads merely to model Node's event
  loop.
- Bound callback count, timer count, and execution time so an embedding can
  terminate runaway work.
- Reset timers and queued work at command exit.

Acceptance gate: Promise/timer ordering matches the chosen compatibility tests,
and running the same fixture twice leaves no queued callbacks behind.

### 4. Expose Fetch semantics over Dolly HTTP

- Implement `fetch`, `Headers`, `Request`, `Response`, `AbortController`, and
  the measured web-stream/async-iterator subset inside QuickJS.
- Call `dolly_http_perform`; never call browser `fetch` directly from the JS
  runtime.
- For version 0, let the native call block the runtime worker while the page
  remains responsive. Spool the bounded response in WasmFS or Wasm memory, then
  expose already-available chunks through Promise/async-iterator interfaces.
- Add incremental re-entry only if Pi proves that buffered serial delivery is
  observably insufficient.
- Do not implement `node:net`, `node:tls`, or socket-oriented Undici internals.
  Adapt or omit proxy behavior and use the Dolly Fetch surface.
- Enforce response limits, timeout, cancellation outcome, and deterministic
  cleanup.

The current generic headless command accepts `DOLLY_PI_API_KEY` in its Wasm
environment, so a real key supplied that way does enter sandbox memory. The
integration test uses only the non-secret value `dolly-no-secret`. The intended
production policy is stricter: Pi receives a placeholder, and a browser-owned
HTTP broker removes agent-provided credential headers and injects a real secret
only for an exact allowlisted provider origin and path. Redirect destinations
must be revalidated. That browser policy has not yet been implemented and must
not be inferred from the runtime adapter alone.

Acceptance gate: a JavaScript streaming-response fixture and one real Pi model
request both cross only `env.dolly_http_dispatch`. Browser import auditing must
show no new autonomous network edge.

### 5. Run the headless Pi kernel

- Prefer Pi's programmatic session/agent API for the first run so package
  management, extensions, native image code, and terminal UI do not obscure the
  runtime boundary.
- Supply explicit Dolly filesystem and shell operations rather than pretending
  a host Node process exists.
- Store Pi state and configuration under `/home/dolly` in WasmFS.
- Start with one approved provider and one fixed model.
- Exercise an agent turn that reads a file, edits it, and verifies it with a
  command.

Acceptance gate: Pi completes a useful coding turn entirely in the browser,
and closing the worker destroys its filesystem and agent state.

### 6. Add process-shaped JavaScript compatibility

Pi's shell tool already has an injectable operation boundary. The first
implementation should call Dolly lifecycle operations directly:

- invoke `/bin/slop -c COMMAND` through `dolly_spawn`/`dolly_wait`;
- route stdin/stdout/stderr through unlinked WasmFS spool files;
- return captured output and exit status through Pi's expected async interface;
- execute one command at a time;
- reject detach, background jobs, host PIDs, IPC, and native executables.

If the unmodified CLI later requires `node:child_process`, implement a narrow
`spawn` facade over the same operation. The native execution may complete
synchronously, while stdout/stderr/close events are queued until after `spawn`
returns so callers can attach handlers. Add only options demonstrated by Pi.

Acceptance gate: the same Pi tool scenario works through the explicit adapter
and, later, through the measured unmodified CLI path without any browser
process provider.

### 7. Complete the tty substrate and move Ghostty core

Pi's headless modes do not require this phase. Its interactive UI does.

Ghostty placement is not an API compatibility requirement for Pi. Pi's TUI
writes VT bytes and reads tty bytes; those bytes are now parsed by
`libghostty-vt` inside Dolly. The immediate blocker is the remaining tty
behavior: raw mode, `ioctl` window size, restoration, interrupts, and timer-
driven redraws. Headless `pi -p` remains the deliberate solution while that
substrate is incomplete.

Inside Dolly:

- add `isatty` behavior for terminal descriptors;
- implement the measured `termios` raw/canonical flags;
- add `ioctl(TIOCGWINSZ)` and a versioned resize record;
- restore terminal modes when a command exits or aborts;
- route Ctrl+C and EOF according to the active foreground mode;
- expose standard-stream events to the JavaScript compatibility layer;
- cap paste size and output rate.

The Ghostty portion of this phase is complete: preserve the cold-browser source
build, typed RGBA/input WAT contract, browser proof, and minimal F11/DOM-event/
canvas frontend while tty control evolves.

The presenter must cap dimensions and buffer lengths and must treat every cell,
glyph, URL, title, and OSC payload as attacker-controlled. Clipboard writes,
automatic link opening, image fetching, and title-driven DOM mutation are off
by default.

Acceptance gate: Pi's interactive UI, a terminal torture fixture, and the
existing Lua REPL work through raw/canonical transitions and resize. The exact
browser import allowlist remains reviewed.

### 8. Run the unmodified noninteractive Pi CLI

- Install an actual `/usr/bin/pi` filesystem executable, not a hidden browser
  command or pathname switch.
- Load Pi's official CLI entry from WasmFS using the same QuickJS runtime and
  compatibility modules.
- Support `--version`, `--help`, and the selected print/noninteractive mode.
- Replace only facilities that are fundamentally unavailable, and keep every
  adaptation small, source-visible, and tested.
- Re-run the missing-API inventory and remove compatibility code not exercised
  by Pi or another named agent tool.

Acceptance gate: a user can invoke `pi` through ordinary `PATH` resolution and
complete the same headless coding turn as the programmatic milestone.

### 9. Bootstrap TypeScript inside Dolly

The TypeScript compiler is JavaScript. Once filesystem, paths, process state,
module loading, and the event pump exist, package a pinned TypeScript source
distribution and run it with QuickJS.

- Add an actual `/usr/bin/tsc` filesystem command.
- Implement CommonJS loading only if the pinned compiler demonstrates that it
  is required; do not add it speculatively for Pi.
- Compile a no-dependency `.ts` fixture to JavaScript in WasmFS.
- Compile a multi-file ESM fixture using Dolly's module resolution.
- Package pinned Pi TypeScript and dependencies as source/package inputs.
- Build the Pi packages in dependency order inside Dolly.
- Prefer unbundled ESM output plus the filesystem module loader. Do not add a
  native esbuild executable merely because upstream uses esbuild for release
  packaging.
- If bundling is proven necessary, select a pure JavaScript bundler that can run
  over the same interface, or document the precise missing facility first.

Acceptance gate: delete the temporary published Pi bundle from the final image,
boot a fresh worker, build Pi from its pinned sources, and run `/usr/bin/pi`.
No host-generated Pi JavaScript executable remains.

### 10. Packages and TypeScript extensions

This phase is deliberately last.

- Decide which Pi package and extension mechanisms are useful to agents.
- Add package lookup from WasmFS before attempting registry installation.
- Treat `jiti` and dynamic TypeScript extensions as compatibility probes, not
  automatic requirements.
- If registry installation is needed, route registry and tarball requests
  through the same HTTP broker, checksum content, unpack only into WasmFS, and
  reject native addons and lifecycle scripts unless explicitly supported.
- Never execute browser JavaScript, native Node addons, or host package-manager
  processes.

Acceptance gate: one pinned, pure-JavaScript/TypeScript extension installs or
loads reproducibly and gains no browser authority beyond Pi itself.

## Testing and security gates

Every work package must preserve these tests:

1. The generated browser import closure changes only after explicit review.
2. `env.dolly_http_dispatch` remains the sole agent-selected network import.
3. JavaScript `fs` operations can observe WasmFS and cannot observe browser or
   host files.
4. JavaScript subprocess APIs cannot reach browser or host processes.
5. Agent-controlled module paths cannot cause the loader to fetch a URL.
6. In production credential-injection mode, provider credentials never appear
   in Wasm memory, terminal output, error messages, request URLs, or
   agent-visible response headers. Until that browser policy exists, keys
   passed through `DOLLY_PI_API_KEY` are explicitly sandbox-visible.
7. Redirect, origin, request-size, response-size, timeout, and quota policy is
   enforced after total in-Wasm compromise.
8. Repeated Pi and QuickJS invocations reset timers, module globals, descriptors,
   terminal modes, temporary spools, and command-local exit state.
9. Terminal output cannot automatically write the clipboard, open a URL, fetch
   an image, or select arbitrary DOM targets.
10. A browser test performs an actual model turn, filesystem edit, Slop command,
    and terminal interaction through the production worker path.

## Explicit non-goals for the POC

- V8 or literal Node;
- complete Node API compatibility;
- native Node addons or N-API;
- worker threads, multiprocessing, detached jobs, or job control;
- raw TCP, UDP, DNS, TLS, or proxy sockets;
- npm lifecycle scripts and arbitrary package installation;
- performance parity with native Pi;
- hiding Dolly memory from the trusted embedding page;
- isolation between commands inside the shared userspace;
- importing Canvas, DOM, WebGL, or WebGPU as a general-purpose agent API.

## Next implementation order

1. Add a typed tty-control revision: `isatty`, raw/canonical mode, window size,
   resize generation, foreground interrupt, and restoration on command exit.
2. Add the smallest QuickJS stdin event pump and `process.stdout` size updates
   needed by a measured Pi TUI probe.
3. Bundle the pinned upstream Pi TUI entry and keep the current headless path as
   a regression test. Extend Node-shaped modules only when the probe names a
   missing symbol.
4. Extend the existing in-Wasm Ghostty RGBA path only where the Pi TUI exposes a
   concrete gap (for example selection, richer shaping, or accessibility).

TypeScript source builds and extension loading follow the TUI compatibility
probe; neither is needed to preserve the working headless agent loop.
