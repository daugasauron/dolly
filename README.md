# Dolly

Dolly is an experiment in defining the smallest useful coding-agent userspace
for the browser. Programs run as wasm64 modules in one WebAssembly machine,
share an in-memory filesystem, and communicate with the outside world only
through explicit browser imports.

The project is deliberately not “Linux in a tab.” It asks a narrower question:
which files, commands, lifecycle operations, clocks, entropy, and network
facilities do real coding agents actually need?

## Current state

Dolly currently boots a source-built userspace containing:

- the finite Slop shell and separately compiled core commands in `/bin`;
- Clang 24, LLD, C and C++23 compilation, archives, and dynamic loading;
- GNU Make, One True Awk, sbase utilities, zlib, Git, and Fetch-backed libcurl;
- an optional Python image with source-built CPython 3.14 and Bonnie for
  portable-wheel installation through that same libcurl;
- QuickJS-ng with the Janis Node-shaped compatibility layer;
- upstream Pi's full TUI, JavaScript extensions, timer animation, and
  incrementally streamed model responses, launched by default with Slop as a
  recovery shell;
- `Ctrl+Shift+V`/`Ctrl+Shift+C` paste and copy through bounded in-Wasm
  clipboard buffers, plus browser-tested OpenRouter/Codex login flows;
- native wasm64 Zig and Ghostty's VT engine with in-Wasm text rasterization;
- an exclusive in-Wasm RGBA framebuffer lease for games and visual tools, with
  automatic terminal restoration on return or Ctrl-C; the gamedev image adds
  source-built raylib 6.0, Box2D 3.1.1, a Pi skill, and an interactive game;
- Ghostty-owned selection and scrollback inside Wasm, phone touch scrolling, a
  minimal phone `/` command menu.

The root page is an image and documentation menu generated from source-visible
Dollyfiles. `/default/`, `/gamedev/`, and `/python/` restore snapshots cryptographically
bound to their exact recipe chains, entry records, and retained manifests. Each
image's `/rebuild/` route compiles `/bin/dollyfile` inside Wasm, then that C
program fetches and verifies every independent `SOURCE` and executes the recipe
strictly row by row. Prebuilt boot does not download image source inputs.
Mutable runtime state never becomes browser or host filesystem state.
Named sessions are the explicit exception in storage direction: Ctrl+Shift+S
serializes the in-Wasm filesystem, compresses it, and stores the opaque bytes
in same-origin IndexedDB. `/load/?session=NAME` restores only a session whose
runtime build and Dollyfile identity still match.

The menu also accepts a bounded text Dollyfile that directly
`EXTENDS default`. A small browser-side check only selects the route; the C
engine remains authoritative. The text stays in the current tab's
`sessionStorage` and executes only at `/custom/rebuild/` in a fresh Wasm
sandbox. Selecting a file does not upload the recipe to the server.

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
shared wasm64 runtime
  ├─ WasmFS, descriptors, cwd, environment, terminal, lifecycle
  ├─ compiler + loader + versioned executable contract
  └─ /bin and /usr/bin filesystem modules sharing the same memory
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
The public Pages embedding permits generic HTTP(S) through Dolly's one browser
broker, including sandbox-supplied credential headers. This is useful for
agents and deliberately not safe against exfiltration from a compromised
userspace. A stricter embedding can install exact destination rules without
changing the Wasm runtime.

Useful narrower commands:

```sh
npm run build:runtime         # build the runtime without exporting a snapshot
npm run snapshot              # rebuild and package the static system image
node --test test/dolly.test.mjs
./scripts/test-browser.sh
```

The development HTTP broker is intentionally permissive and is not a safe
deployment policy. A real embedding must install exact destination rules and
explicitly allow only the sandbox credential-header names those destinations
need. Credential values remain inside Dolly; the browser does not inject them.

## Contracts and documentation

- [Architecture](docs/architecture.md) — runtime, compiler, filesystem,
  lifecycle, snapshot, and display design.
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
- [Port status](docs/port-status.md) — evidence for current and deferred ports.
- [Pi compatibility](docs/pi-agent-plan.md) — current Pi/Janis boundary,
  evidence, and next work.
- [JavaScript runtime choice](docs/javascript-runtime.md) — why QuickJS-ng is
  retained and what would justify replacing it.
- [Zig and Ghostty](docs/zig-ghostty.md) and the
  [native Zig bootstrap](docs/native-zig-bootstrap.md) — focused runtime
  experiments.
- [Project audit](docs/audit-2026-08-30.md) and
  [agent workload audit](docs/agent-audit-2026-08-31.md) — dated verification
  records; current priorities live in the roadmap.
- [Roadmap](docs/roadmap.md) — prioritized next milestones and acceptance gates.
- [Dollyfile version 1](docs/dollyfile.md) — the C-executed sequential
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

Dolly is still a research prototype. In particular, the current command ABI is
libc-shaped and Emscripten-specific, command cleanup is incomplete, Janis is a
measured subset rather than Node, and transparent Git clone/fetch plus an
in-Dolly TypeScript source build remain open work.
