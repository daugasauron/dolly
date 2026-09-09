# Dolly

A minimal POSIX-like coding-agent userspace inside a browser's wasm64 sandbox.
Ordinary executables, compilers, runtimes and Slop share a filesystem owned by
the Wasm kernel. The browser supplies neither host files nor native subprocesses.

The experiment is the compile target, not Linux emulation. See
[AGENTS.md](AGENTS.md) for the design intent.

## Try it

Open [daugasauron.com](https://daugasauron.com/) or
[GitHub Pages](https://daugasauron.github.io/dolly/). The home page lists each
image, its Dollyfile and its prebuilt/rebuild routes: shell tools, Python, Pi,
Neovim, gamedev and Dollyfile Studio.

`/custom/` builds a pasted or uploaded Dollyfile in a fresh sandbox.
Studio provides Pi, Neovim syntax/linting and `dollyfile-build FILE`; builds
stream immediately, and only **Open image** launches the result in a new tab.

`Ctrl+Shift+C/V` copy/paste; `Ctrl+Shift+S` saves filesystem changes.
`/session/` lists saves and `/session/NAME` restores one. Saves are not running
processes and do not yet support custom images. `upload DESTINATION` and
`download FILE` explicitly transfer one file. See [sessions](docs/sessions.md).

Requires shared WebAssembly memory64/table64; there is no wasm32 fallback.
[Local Qwen models](docs/browser-local-models.md) additionally need hardware
WebGPU. `Ctrl+Shift+L` opens the model picker.

## Boundary

Assume all Wasm userspace is compromised. The trusted browser providers remain
the containment boundary. Programs receive no ambient Fetch, sockets, DOM or
JavaScript evaluation capability.

`env.dolly_http_dispatch` is the sole intentional agent-selected network edge.
The demo allows arbitrary HTTP(S), including credentials stored inside Dolly:
it **does not prevent exfiltration of sandbox data**. Restricted embeddings must
enforce policy in the browser broker. CORS still applies. Read the
[boundary review map](docs/browser-boundary.md) and [security model](docs/security.md).

## Develop

Bootstrap requirements: Node.js/npm, Git, Chrome, Docker or Podman, Python 3.14,
a host C/C++ compiler and GNU Make. These are not sandbox capabilities.

```sh
npm ci
./scripts/build-toolchain.sh           # expensive compiler seed
npm run build:runtime
npm run image -- default --package    # build and publish one image locally
DOLLY_PORT=9000 npm run serve
```

The server reads only `build/releases/current`. Publishing a selected catalog
replaces the menu; use `DOLLY_BUILD_IMAGES=all npm run publish` for all images.
For source checks run `node --test test/*.test.mjs`; `npm test` also builds
and runs the browser suite. See [sources](docs/sources.md) for bootstrap details
and [deployment](docs/deployment.md) for sealed static exports.

## Documentation

- [Dollyfiles](docs/dollyfile.md) and [Studio builds](docs/image-build-service.md).
- [Architecture](docs/architecture.md), [processes](docs/process-model.md), [ABI](abi/README.md).
- [Slop and Make](docs/slop.md), [ports](docs/port-status.md), [Pi](docs/pi-agent-plan.md).
- [RTS arena experiment](docs/rts-arena.md) (branch work, not deployed).
- [Remaining audit work](docs/audit-handoff.md) and [direction](docs/roadmap.md).

Dolly is a prototype, not full POSIX, Node or libcurl compatibility.
[MIT licensed](LICENSE); bundled upstream programs retain their own licenses.
