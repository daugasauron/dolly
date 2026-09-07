# Dolly

Dolly is a minimal POSIX-like coding-agent userspace inside a browser's wasm64
sandbox. Programs are ordinary executable files found through `PATH`. Slop,
compilers, language runtimes and tools share one filesystem owned by the Wasm
kernel; the browser provides neither a host filesystem nor native subprocesses.

The experiment is the compile target: typed imports/exports, memory layout,
files and command lifecycle. See [AGENTS.md](AGENTS.md) for the design intent.

## Try an image

The home page lists source-visible Dollyfiles and their prebuilt/rebuild routes.

- `/default/`: Slop, C/C++, Make, Git and conventional command-line tools.
- `/python/` and `/python-pi/`: CPython, Bonnie package installation and optional Pi.
- `/pi/` and `/pi-local/`: Pi running under QuickJS-ng/Janis, with remote or
  browser-local models.
- `/neovim/`: source-built Neovim; `:q` returns to Slop.
- `/gamedev/` and `/bhop/`: source-built raylib/Box3D and the Foundry
  strafe-jumping course.
- `/dollyfile-studio/`: Pi, Neovim syntax/linting and examples for creating images.
  `dollyfile-build --open FILE` requests browser approval, streams build logs,
  and opens the verified result.

`/custom/` accepts a pasted or uploaded Dollyfile and builds it in a fresh
sandbox. Recipes run sequentially; source hashes and image identities are
verified. Prebuilt launches skip compilation and source downloads. Expensive
builder images are separate: system images copy Ghostty's finished display
library without retaining its Zig SDK.

`upload DESTINATION` asks the user to choose one file; `download FILE` exports
one. `Ctrl+Shift+C/V` copy/paste, `Ctrl+Shift+S` saves filesystem changes in this
browser, and `/session/` lists named saves. `/session/NAME` restores a matching
base image plus those changes, not running processes. Custom-image save/load
is not implemented. See [sessions](docs/sessions.md).

Dolly requires shared WebAssembly memory64 and table64; there is no wasm32
fallback. Local Qwen additionally requires a compatible hardware WebGPU adapter.
`Ctrl+Shift+L` opens its model picker and setup help; see
[local models](docs/browser-local-models.md).

## The boundary

```text
trusted browser imports and providers
  ├─ bounded input/display, explicit user file transfer and opaque session storage
  └─ env.dolly_http_dispatch → browser policy → Fetch
                 │
wasm64 kernel: filesystem, descriptors, environment and lifecycle
                 │ typed process gate
                 └─ ordinary programs in private Wasm memories
```

Assume the entire Wasm userspace is compromised. Internal process separation
supports lifecycle and compatibility; the outer browser imports provide host
containment. Programs receive no ambient Fetch, sockets, DOM or JavaScript
evaluation capability. Unsupported operations fail explicitly.

The demo intentionally allows arbitrary HTTP(S), including credentials stored
inside Dolly. It therefore does **not** prevent exfiltration of sandbox data.
A restricted embedding must enforce destination/header/resource policy in the
browser broker. CORS still applies. Start with the human-readable
[boundary review](docs/browser-boundary.md) and [HTTP contract](docs/http.md).

## Build and run

Build-time requirements: Node.js/npm, Git, Google Chrome, Docker or Podman,
Python 3.14, a host C/C++ compiler and GNU Make. These bootstrap tools are not
available to sandbox programs.

```sh
npm ci
./scripts/build-toolchain.sh   # expensive one-time compiler seed
npm test                      # build images, source tests and real browser checks
DOLLY_BUILD_IMAGES=all npm run publish
DOLLY_PORT=9000 npm run serve
```

The server reads `build/releases/current`, never mutable source or `dist/`.
Publication verifies the whole catalog and switches it atomically; old releases
remain available to pinned tabs. `DOLLY_BUILD_IMAGES` limits the published
catalog, replacing rather than merging the menu.

For narrower iteration, use `npm run image -- pi` to prepare one image,
`DOLLY_SNAPSHOT_IMAGE=pi npm run snapshot` to rebuild its snapshot, and
`node --test test/*.test.mjs` for source checks.

Static deployments export a verified release:

```sh
npm run export:static -- build/releases/current build/static-site /
```

Use `/dolly/` for a nested deployment. The exporter does not upload anything;
routing, headers, immutable caching and retention requirements are documented in
[deployment](docs/deployment.md). Commit before producing an artifact intended
for the manual Pages workflow; published binaries do not belong in Git history.

## Further reading

- [Dollyfile language](docs/dollyfile.md) and [Studio build service](docs/image-build-service.md).
- [Architecture](docs/architecture.md), [process model](docs/process-model.md) and
  [canonical ABI](abi/README.md).
- [Source pins and preparation](docs/sources.md), [port status](docs/port-status.md)
  and [Slop/Make](docs/slop.md).
- [Audit handoff](docs/audit-handoff.md): current evidence and remaining work.

Dolly is a research prototype, not full Linux, Node or libcurl compatibility.
The process ABI is experimental; the display plugin remains Emscripten-specific.
Small local models are not yet reliable for independent Studio workflows,
fd/ripgrep are missing, and the isolated Codex port is not a working full agent.
