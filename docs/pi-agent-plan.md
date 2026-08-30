# Pi agent compatibility plan

Status: upstream Pi TUI and JavaScript extensions implemented; TypeScript source build planned
Last updated: 2026-08-30

## Implemented baseline

The first useful Pi slice now works in the production browser path:

- `/usr/bin/pi` is a normal Dolly filesystem executable found through `PATH`;
- it runs pinned upstream Pi 0.84.4's complete CLI bundle on source-built
  QuickJS-ng through the finite Janis Node-compatibility layer;
- the JavaScript compatibility layer exposes only selected Node-shaped behavior
  over WasmFS, Dolly lifecycle calls, and `dolly_http_perform`;
- a normal Pi extension replaces `bash`, `read`, `edit`, and `write` with shared
  WasmFS and Slop operations;
- `pi --version`, the upstream interactive TUI, raw input, resize, Ctrl-D exit,
  system prompt, settings, and extension discovery work;
- `/login openrouter` accepts a pasted key, commits it to the in-Wasm
  `auth.json`, releases Pi's lock directory, and makes the built-in model
  catalog available to a fresh Pi invocation;
- `/login openai-codex` loads Pi's upstream OAuth flow, generates PKCE inside
  Dolly, handles the unavailable callback listener as `ENOSYS`, and presents
  the authorization URL plus manual-code input in Ghostty; the browser test
  completes the code exchange through an exact trusted-broker fixture, verifies
  the PKCE form, finds the returned account credential in the in-Wasm
  `auth.json`, and lists Codex models from a fresh Pi invocation;
- the browser integration test drives an actual streaming Pi provider adapter,
  a tool call, a WasmFS write, a Slop command, a second model request containing
  the tool result, and the final response through `env.dolly_http_dispatch`;
- a real OpenRouter turn reads its key from ephemeral in-Wasm Pi
  configuration, installs a dependency-free JavaScript extension through Dolly
  curl, and a restarted Pi loads and invokes that extension through upstream
  Jiti.

Pi itself is not forked. Packaging performs a small asserted compatibility
lowering for QuickJS's missing Unicode-set regex syntax, retains the upstream
async main promise, routes bundled Node builtins to Janis, and uses Pi's own
standalone-runtime registration table to statically include its upstream OAuth
flows. Building Pi's TypeScript sources inside Dolly remains future work. The exact current
implementation is summarized in
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
5. Promise-shaped filesystem and process APIs may be backed by synchronous
   Dolly operations. Streaming HTTP cooperatively polls the one mailbox so
   timers, Promise jobs, and response consumers advance without threads.
6. `libghostty-vt`, the RGBA display driver, tty-control APIs, and JavaScript
   stdin/event pump build and run inside Dolly. The browser remains a narrow
   framebuffer presenter and raw event source.
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
text/IME, resize, paste-notification, and pointer-selection events; the bounded
paste and copy bytes themselves live in shared Wasm memory.

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
renderer at the cost of full-frame copies. Character-cell selection and bounded
user-gesture clipboard exchange are implemented; richer shaping is not.

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
module. A checksum-pinned external Zig stage zero builds the upstream compiler
as an ABI-validated wasm64 command. Native `/usr/bin/zig` emits Ghostty's object
directly inside WasmFS; Dolly archives and links it in the shared userspace and
proves a fixed VT byte stream produces an inspectable cell grid. The detailed
architecture and cold-browser evidence are in
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
| P2 | A headless prompt completes through one browser-approved model provider. | Done with both a deterministic fixture and a real OpenRouter request using sandbox-owned credentials |
| P3 | Pi reads and writes files in `/workspace`. | Done; the Dolly extension provides read, write, and exact-occurrence edit |
| P4 | Pi runs a shell tool through `/bin/slop -c` and receives output/status. | Done |
| P5 | Pi's noninteractive CLI mode works through `/usr/bin/pi` without a browser-side launcher. | Done through the upstream CLI entry |
| P6 | Pi's interactive terminal UI works with raw input and resize handling. | Done through Janis and the in-Wasm Ghostty display |
| P7 | The TypeScript compiler runs inside Dolly and builds pinned Pi sources. | Planned |
| P8 | A documented subset of Pi packages/extensions can be loaded from WasmFS. | Done for dependency-free JavaScript extensions; arbitrary npm packages remain out of scope |

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

Known deferrals include native image processing, runtime installation of
arbitrary npm packages, proxy/socket agents, and background subprocesses. The
inventory decides the exact list.

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

### 2. Implement the serial Node foundation

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
- Call `dolly_http_start`/`dolly_http_poll`; never call browser `fetch` directly
  from the JS runtime. Synchronous libcurl continues to use
  `dolly_http_perform` above the same primitives.
- Return the JavaScript response after its headers and enqueue each arriving
  mailbox body record into an in-Wasm `ReadableStream`.
- Pump HTTP beside timers and Promise jobs with a bounded 10 ms terminal wait
  while active. This preserves the one-worker model while fixing Pi's measured
  spinner and token-stream behavior.
- Do not implement `node:net`, `node:tls`, or socket-oriented Undici internals.
  Adapt or omit proxy behavior and use the Dolly Fetch surface.
- Enforce response limits, timeout, cancellation outcome, and deterministic
  cleanup.

Provider credentials intentionally live in Dolly's ephemeral WasmFS or
environment so ordinary applications can manage them. Pi authors its own
authorization header. A hardened browser policy permits that header name only
for an exact allowlisted provider origin, path, and method; it never injects or
rewrites the secret. Redirects are rejected, and request count, time, request
bytes, and response bytes are bounded. The real-provider proof copies its key
into the sandbox's in-memory Pi configuration and destroys that state with the
worker.

Acceptance gate: done. A deliberately delayed SSE fixture proves Pi frames
advance before the first token, the first answer prefix is visible before the
server sends its suffix, and the completed model/tool turn still crosses only
`env.dolly_http_dispatch`. Browser import auditing shows no new autonomous
network edge.

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

This phase is implemented and remains a regression gate.

Ghostty placement is not an API compatibility requirement for Pi. Pi's TUI
writes VT bytes and reads tty bytes; those bytes are parsed by `libghostty-vt`
inside Dolly. Raw mode, `ioctl` window size, restoration, interrupts, EOF, and
timer-driven redraws now support the upstream interactive CLI.

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
6. Provider credentials remain inside ephemeral Wasm state and may leave only
   in explicitly permitted request headers to an exact matched destination;
   they do not enter snapshots or browser persistence.
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

These Pi-specific steps are incorporated into the broader
[`roadmap.md`](roadmap.md).

1. Run a pinned TypeScript compiler under Janis and compile single- and
   multi-file ESM fixtures into WasmFS.
2. Build pinned Pi TypeScript sources inside Dolly and retire the host-generated
   Pi implementation bundle while retaining exact upstream-version assertions.
3. Complete Git's remote-helper protocol or another narrowly reviewed source
   transport so Pi can install allowlisted Git extensions without npm.
4. Extend package loading only for concrete, dependency-free agent extensions;
   keep native addons and lifecycle scripts rejected.
5. Extend Janis or Ghostty only when a measured Pi/extension workload exposes a
   missing API, and keep the headless, TUI, credential, and restart proofs as
   regression gates.
