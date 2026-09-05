# Dolly

Dolly is an experiment in defining the smallest useful coding-agent userspace
for the browser. A wasm64 kernel owns the in-memory userspace, while ordinary
programs run in private wasm64 memories and reach that shared state only through
the typed Dolly process ABI. The complete userspace communicates with the
outside world only through explicit browser imports.

The project is deliberately not “Linux in a tab.” It asks a narrower question:
which files, commands, lifecycle operations, clocks, entropy, and network
facilities do real coding agents actually need?

## Current state

Dolly currently boots a source-built userspace containing:

- the finite Slop shell and separately compiled core commands in `/bin`;
- Clang 24, LLD, C and C++23 compilation, archives, and dynamic loading;
- GNU Make, Ninja-compatible Samurai, One True Awk, sbase utilities, zlib,
  Git, and Fetch-backed libcurl;
- an optional Python image with source-built CPython 3.14 and Bonnie for
  recursive, hash-verified wheel and source-distribution builds through that
  same libcurl; a clean browser gate source-builds and imports NumPy and Pandas
  as Dolly-native wasm64 extensions. CPython reports the distinct `dolly`
  platform, raw sockets fail explicitly, upstream `termios` controls Dolly's
  in-Wasm line discipline, requirements files are accepted sequentially, and
  wheel console entry points become separately compiled wasm64 PATH commands;
  offline environment inspection includes dependency-consistency checks;
- QuickJS-ng with the Janis Node-shaped compatibility layer;
- TypeScript 5.9.3 running under Janis as `/usr/bin/tsc`, with single- and
  multi-file ESM compilation into WasmFS and target-side emit of the exact
  seven-package, 495-module upstream Pi runtime workspace;
- `/usr/bin/pi` loading that source-built, unbundled workspace plus an explicit
  lockfile-verified external package profile through Janis's WasmFS-only ESM,
  CommonJS, and JSON resolver; the full TUI, JavaScript extensions, timer
  animation, fixture streaming, and a real OpenRouter tool/install turn pass
  without a host-generated application bundle;
- `Ctrl+Shift+V`/`Ctrl+Shift+C` paste and copy through bounded in-Wasm
  clipboard buffers, plus browser-tested OpenRouter/Codex login flows;
- native wasm64 Zig and Ghostty's VT engine with in-Wasm text rasterization;
- an exclusive in-Wasm RGBA framebuffer lease for games and visual tools, with
  automatic terminal restoration on return or Ctrl-C; the gamedev image adds
  source-built raylib 6.0, Box3D 0.1.0, a Pi skill, and an interactive 3D
  physics game;
- Ghostty-owned selection and scrollback inside Wasm, phone touch scrolling, a
  minimal phone `/` command menu.

The root page is an image and documentation menu generated from source-visible
Dollyfiles. `/default/`, `/pi/`, `/python/`, `/python-pi/`, and `/gamedev/` restore snapshots cryptographically
bound to their exact recipe chains, entry records, and retained manifests. Each
image's `/rebuild/` route compiles `/bin/dollyfile` inside Wasm, then that C
program fetches and verifies every independent `SOURCE` and executes the recipe
strictly row by row. Prebuilt boot does not download image source inputs.
Each image's final startup module installs `/home/dolly/.dollyrc`; the runtime
runs that ordinary Slop script before `ENTRY`, keeping greetings and suggested
commands in source-visible userspace rather than browser UI or new recipe
syntax.
Mutable runtime state never becomes browser or host filesystem state.
Named sessions are the explicit exception in storage direction: Ctrl+Shift+S
serializes the in-Wasm filesystem, compresses it, and stores the opaque bytes
in same-origin IndexedDB. `/load/?session=NAME` restores only a session whose
runtime build and Dollyfile identity still match.

The menu also accepts a bounded text Dollyfile that selects pinned modules.
A small browser-side check only selects the route; the C
engine remains authoritative. The text stays in the current tab's
`sessionStorage` and executes only at `/custom/rebuild/` in a fresh Wasm
sandbox. Selecting a file does not upload the recipe to the server.
Because that source is tab-local rather than a packaged image identity,
uploaded custom images do not yet support named-session save/restore.

The browser must support shared WebAssembly memory64 and table64. Chrome does;
Safari/WebKit support is version-dependent. On iPhone and iPad every browser
uses the installed WebKit engine. Dolly does not silently fall back to wasm32
because pointer width is part of its machine ABI.

## Architecture

```text
trusted browser page
  ├─ fixed startup assets
  ├─ raw input + bounded RGBA canvas blit
  ├─ explicit bounded file download → local user
  └─ env.dolly_http_dispatch       ← sole agent-selected network edge
              │
              ▼
wasm64 kernel
  ├─ WasmFS, descriptors, cwd, environment, terminal, lifecycle
  ├─ resident Ghostty display plugin
  └─ typed, copying process gate
              │
              ├─ Slop and each /bin or /usr/bin command
              ├─ language runtimes and their process-local DSOs
              └─ private Clang/LLD/Zig compiler executable
                 (one Worker and private memory per running process)
```

Assume that every byte inside the Wasm machine is compromised. Containment
comes from the outer import boundary, not from permissions between commands.
The browser does not provide a host filesystem, native subprocesses, sockets,
DOM access, or ambient `fetch`. See [the security model](docs/security.md).

## Build and run

Requirements: Node.js, npm, Google Chrome, and Docker or Podman.

```sh
npm ci
./scripts/build-toolchain.sh   # expensive one-time wasm64 Clang/LLD seed
npm test                      # build, snapshot, static tests, browser proof
npm run serve                 # http://127.0.0.1:8080/
```

The Pages deployment is intentionally artifact-based: the current browser
bundle is hundreds of megabytes and does not belong in Git history. After a
local audited build, `scripts/package-pages.sh` creates the static release
asset consumed by the manual `Deploy Dolly demo` workflow. A tiny same-origin
service worker supplies the COOP/COEP headers that GitHub Pages cannot set.
Packaged snapshots use gzip delivery to keep all five images below the Pages
site size limit; the browser bounds decompression and verifies the original
snapshot size and SHA-256 before loading it into Wasm.
The public Pages embedding permits generic HTTP(S) through Dolly's one browser
broker, including sandbox-supplied credential headers. This is useful for
agents and deliberately not safe against exfiltration from a compromised
userspace. A stricter embedding can install exact destination rules without
changing the Wasm runtime.

Useful narrower commands:

```sh
npm run build:runtime         # build the runtime without exporting a snapshot
npm run snapshot              # refresh routes, rebuild, and package every image
DOLLY_SNAPSHOT_IMAGE=python npm run snapshot
DOLLY_SNAPSHOT_IMAGE=python npm run snapshot:reproducible
npm run census -- default
npm run fingerprint -- default
node --test test/dolly.test.mjs
./scripts/test-browser.sh
```

The development HTTP broker is intentionally permissive and is not a safe
deployment policy. A real embedding must install exact destination rules and
explicitly allow only the sandbox credential-header names those destinations
need. Credential values remain inside Dolly; the browser does not inject them.

## Contracts and documentation

- [Architecture](docs/architecture.md) — kernel, private processes, compiler,
  filesystem, lifecycle, snapshot, and display design.
- [Process model](docs/process-model.md) — executable format, copying syscall
  gate, process trees, deadlines, and cancellation.
- [ABI](abi/README.md) — canonical WAT contracts, executable format, validation,
  and generated build glue.
- [Security](docs/security.md) — threat model, trusted computing base, single
  egress edge, and required invariants.
- [HTTP](docs/http.md) — typed request surface, libcurl compatibility, and
  browser-side policy.
- [CORS](docs/cors.md) — the browser constraint and safe relay options.
- [Download](docs/download.md) — the explicit bounded WasmFS-to-local-user
  file export contract.
- [Sessions](docs/sessions.md) — opaque WasmFS save/restore through gzip and
  same-origin IndexedDB.
- [Slop and Make](docs/slop.md) — the deliberately finite shell language and
  synchronous build semantics.
- [Display ownership](docs/display.md) — fullscreen framebuffer leases, input,
  double buffering, and terminal restoration.
- [Sources](docs/sources.md) — source pins, patches, generated artifacts, and
  reproducibility policy.
- [Platform census](docs/platform-census.md) — exact typed imports by sealed
  image and the path toward workload-derived ABI evidence.
- [Capability fingerprints](docs/capability-fingerprint.md) — compact separate
  identities for browser authority and complete sealed-image contents.
- [Port status](docs/port-status.md) — evidence for current and deferred ports.
- [Pi compatibility](docs/pi-agent-plan.md) — current Pi/Janis boundary,
  evidence, and next work.
- [JavaScript runtime choice](docs/javascript-runtime.md) — why QuickJS-ng is
  retained and what would justify replacing it.
- [Zig and Ghostty](docs/zig-ghostty.md) and the
  [native Zig bootstrap](docs/native-zig-bootstrap.md) — focused runtime
  experiments.
- [Project audit](docs/audit-2026-08-30.md) and agent workload audits from
  [2026-08-31](docs/agent-audit-2026-08-31.md) and
  [2026-09-01](docs/agent-audit-2026-09-01.md) — dated verification records;
  current priorities live in the roadmap.
- [Roadmap](docs/roadmap.md) — prioritized next milestones and acceptance gates.
- [Dollyfile version 2](docs/dollyfile.md) — the C-executed sequential
  source-to-snapshot recipe and image identity model.

## Design rules

- WAT/Wasm and C headers are the contracts; JSON is generated only for tools
  that require it.
- Programs are ordinary files found through `PATH`, not browser registrations
  or `argv[0]` multicalls.
- Unsupported behavior fails explicitly. Compatibility must not silently turn
  into a host capability or a plausible-but-wrong result.
- Serial, synchronous implementations are preferred until a real agent
  workload proves that concurrency is necessary.
- New imports are capabilities and require contract, policy, and browser-test
  review.

Dolly is still a research prototype. The private process ABI is experimental,
and the resident display plugin still uses an Emscripten-specific interface.
Janis is a measured subset rather than Node, the Pi external package profile
is not a general package manager, and transparent Git clone/fetch remains open
work. Process termination reclaims each command's private memory; the shared
filesystem remains alive in the kernel.
