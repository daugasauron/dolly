# Dolly

Dolly is a minimal POSIX-like userspace for coding agents inside a browser's
wasm64 sandbox. A Wasm kernel owns the filesystem, descriptors and processes;
shells, compilers, Git and agents run as ordinary private Wasm processes. The
browser supplies no host files or native subprocesses. The experiment is the
compile target, not Linux emulation: see [AGENTS.md](AGENTS.md) and the
[architecture](docs/architecture.md).

The product is the modular runtime (kernel, host modules, process model, ABI,
trusted browser code) plus a minimal POSIX userspace. Everything else is a
[demo](demos/README.md) in `demos/DEMO/`; the core never depends on a demo.

## Core images

Every image declares its role: an `APPLICATION` people open, a `TOOLCHAIN`
recipes build on, or a `PACKAGE` recipes and sessions install
([Dollyfile](docs/dollyfile.md#roles-and-names)).

- `default`: Shell, Git, Make and C/C++.
- `system`: `system-tools` with saved sessions (`snapshot@0`, `session-recover`).
- `system-tools`: Shell, display, Git, curl, Make and POSIX tools.
- `system-build`: C/C++ compiler, headers and basic build tools.
- `zig-build`: Zig built from source by the C/C++ compiler; emits C.
- `ghostty-build`: Ghostty terminal build with Zig and its SDK.
- `gpu-sdk`: `system` with the WebGPU host module (`gpu@0`).
- `audio-sdk`: `system` with the PCM playback host module (`audio@0`).
- `zlib`: zlib, as a package.
- `curl`: curl and libcurl over the HTTP broker, as a package.
- `gzip`: gzip over zlib, as a package.
- `display`: the Ghostty display plugin and its font, as a package.

## Try it

Open [daugasauron.com](https://daugasauron.com/) or
[GitHub Pages](https://daugasauron.github.io/dolly/). The menu lists every image.

- `/IMAGE/` boots the prebuilt image; `/IMAGE/rebuild/` builds it from its
  Dollyfile in your browser; `/view/IMAGE/` shows the recipe.
- `/custom/` builds your own [Dollyfile](docs/dollyfile.md); `/sessions/` lists
  [saved sessions](docs/sessions.md) and `/session/?name=NAME` opens one.
- `Ctrl+Shift+C`/`V` copy and paste, `Ctrl+Shift+S` saves, `F11` toggles
  fullscreen. `upload PATH` and `download FILE` move single files.
- Needs cross-origin isolation and shared WebAssembly memory64/table64; there is
  no wasm32 fallback.

## Boundary

Assume all Wasm userspace is compromised; the trusted browser providers are the
containment boundary. `env.dolly_http_dispatch` is the only agent-selected network
edge. The public demo allows arbitrary HTTP(S), including credentials stored in
Dolly: it **does not prevent exfiltration of sandbox data**. Restricted embeddings
must set a policy in the browser broker ([browser boundary](docs/browser-boundary.md)).

## Develop

Host requirements: Node.js, Git, Chrome, Docker or Podman, Python 3.14, a host
C/C++ compiler and GNU Make. None of them is a sandbox capability.

```sh
npm ci
npx playwright-core install firefox
./scripts/build-toolchain.sh          # compiler seed, slow, once
npm run build:runtime                 # kernel and seed; checks the exact ABI
npm run image -- default --plan       # show what would rebuild
npm run image -- default --package    # build an image and a local release
DOLLY_PORT=9000 npm run serve

npm run test:source                   # Node source tests
npm run test:core                     # core scenarios in Chrome and Firefox
npm run test:browser                  # every core browser test (test/*-browser.mjs)
npm run test:demos                    # demo browser tests (demos/*/test/)
npm run test:artifacts                # exact contracts of the built artifacts
npm run test:full                     # rebuilds every image first: hours
```

Image builds rewrite SHA-256 pins in `Dollyfile*`.

## Docs

- [Architecture](docs/architecture.md): components, system calls, core images.
- [Process model](docs/process-model.md): spawn, descriptors, pipes, signals.
- [Machine contracts](abi/README.md): exact Wasm imports, exports and layouts.
- [Host modules](host/README.md): one directory and manifest per browser bridge.
- [Browser boundary](docs/browser-boundary.md): threat model and host modules.
- [HTTP](docs/http.md): broker, policy, libcurl, Git, CORS.
- [Dollyfile](docs/dollyfile.md): recipe language and image builds.
- [Studio builds](docs/image-build-service.md): the `build@0` service.
- [Packages and amy](docs/dollyfile.md#packages-and-amy): `amy install NAME` in a session.
- [Slop and commands](docs/slop.md): the shell and core tools.
- [Sessions and file transfer](docs/sessions.md).
- [Display](docs/display.md), [GPU](docs/gpu.md), [audio](docs/audio.md).
- [Sources and bootstrap](docs/sources.md): pins, seed, core ports.
- [Deployment](docs/deployment.md): static releases.
- [Issues](tasks/README.md).

Dolly is a prototype, not full POSIX, Node or libcurl compatibility.
[MIT licensed](LICENSE); bundled upstream programs keep their own licenses.
