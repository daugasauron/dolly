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

- `default`: A shell, its text tools, curl and amy, which installs the rest.
- `system`: `system-tools` with saved sessions (`snapshot@0`, `session-recover`).
- `system-tools`: Shell, display, Git, curl, Make and POSIX tools.
- `system-build`: C/C++ compiler, headers and basic build tools.
- `zig-build`: Zig built from source by the C/C++ compiler; emits C.
- `ghostty-build`: Ghostty terminal build with Zig and its SDK.
- `gpu-sdk`: `system` with the WebGPU host module (`gpu@0`).
- `audio-sdk`: `system` with the PCM playback and microphone host modules (`audio@0`, `microphone@0`).
- `core`: Slop and its core commands, as a package.
- `cc`: the C/C++ compiler, headers, libraries and Make, as a package.
- `amy`: the package installer and the recipe engine it runs, as a package.
- `posix`: grep, sed, sort, find, xargs, awk, sh and the other text and file tools, as a package.
- `git`: Git over the HTTP broker, with diff and patch, as a package.
- `zlib`: the zlib headers and static library, for programs the `cc` package builds; it installs no compiler, as a package.
- `curl`: curl and libcurl over the HTTP broker, as a package.
- `gzip`: gzip over zlib, as a package.
- `less`: the pager; Git and `man` page through it once it is installed, as a package.
- `display`: the Ghostty display plugin, its font and the terminal's termcap entry, as a package.
- `dolly-docs`: the platform's documents and contracts in `/usr/share/doc/dolly`, as a package.

## Try it

Open [daugasauron.com](https://daugasauron.com/) or
[GitHub Pages](https://daugasauron.github.io/dolly/). The menu lists every image.

- `/IMAGE/` boots the prebuilt image; `/IMAGE/rebuild/` builds it from its
  Dollyfile in your browser; `/view/IMAGE/` shows the recipe.
- `/custom/` builds your own [Dollyfile](docs/dollyfile.md); `/sessions/` lists
  [saved sessions](docs/sessions.md) and `/session/?name=NAME` opens one.
- `Ctrl+Shift+C`/`V` copy and paste, `Ctrl+Shift+S` saves, `F11` toggles
  fullscreen. `Ctrl+Shift+F` shows or hides the page's own indicators (GPU
  adapter, Save, download offers), which leave the corners ten seconds after
  the page is ready. `upload PATH` and `download FILE` move single files.
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
npm run image -- default              # build an image and what it needs
npm run dev -- default                # serve this checkout and dist/ (DOLLY_PORT)
npm run image -- default --package    # also seal a local release for npm run serve
```

Image builds rewrite SHA-256 pins in `Dollyfile*`. Check by what you changed
(measured 2026-10-06 on 16 shared cores):

| Edit | Check | Turnaround |
| --- | --- | --- |
| Scripts, Node-side code | `npm run test:source`, `npm run test:artifacts` | 5 s, 2 s |
| Page JavaScript | `npm run dev`, reload; `npm run test:core` | 33-36 s Chrome, 44-48 s Firefox |
| Kernel C | `npm run build:runtime`, then `npm run test:core` | 9-12 s without changes |
| A recipe or its sources | `npm run image -- IMAGE` | 2 s when nothing changed (`default`); 9 s to rebuild `gzip` |
| Seed: headers, Slop, commands, libc adapter | every image rebuilds | 843 s for the `default` chain (2026-10-05) |
| Before merging | `npm run test:browser` (`test/*-browser.mjs`), `npm run test:demos` (`demos/*/test/`) | 11 min for the core tests in both browsers |

## Docs

- [Architecture](docs/architecture.md): components, system calls, core images.
- [Process model](docs/process-model.md): spawn, descriptors, pipes, signals.
- [Browser stack](docs/browser-stack.md): what bounds recursion, how a process is entered, Firefox, LLVM.
- [Machine contracts](abi/README.md): exact Wasm imports, exports and layouts.
- [Host modules](host/README.md): one directory and manifest per browser bridge.
- [Browser boundary](docs/browser-boundary.md): threat model and host modules.
- [HTTP](docs/http.md): broker, policy, libcurl, Git, CORS.
- [Dollyfile](docs/dollyfile.md): recipe language and image builds.
- [Studio builds](docs/image-build-service.md): the `build@0` service.
- [Packages and amy](docs/dollyfile.md#packages-and-amy): `amy install NAME` in a session.
- [Slop and commands](docs/slop.md): the shell and core tools.
- [Sessions and file transfer](docs/sessions.md).
- [Display](docs/display.md), [input](docs/input.md), [GPU](docs/gpu.md), [audio](docs/audio.md).
- [Sources and bootstrap](docs/sources.md): pins, seed, core ports.
- [Deployment](docs/deployment.md): static releases.
- [Issues](tasks/README.md).

Dolly is a prototype, not full POSIX, Node or libcurl compatibility.
[MIT licensed](LICENSE), except the files marked
`SPDX-License-Identifier: GPL-2.0-or-later`: the Seven Kingdoms port compiled
into the game (`demos/rts`: `Makefile`, `OAUDIO.h`, `arena.*`, `config.h`,
`input.*`) and `demos/zero-ad/engine.patch`. Bundled upstream programs keep
their own [licences](docs/licences.md).
