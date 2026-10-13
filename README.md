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

- `default`: A shell, its text tools, curl, ps, amy, which installs the rest, and nena, which enables the host modules they need.
- `system`: `system-tools` with saved sessions (`snapshot@0`, `session-recover`).
- `system-tools`: Shell, display, Git, curl, Make and POSIX tools.
- `system-build`: C/C++ compiler, headers and basic build tools.
- `zig-build`: Zig built from source by the C/C++ compiler; emits C.
- `ghostty-build`: Ghostty terminal build with Zig and its SDK.
- `core`: the shell `slop` and its core commands: `ls`, `cat`, `cp`, `mv`, `rm`, `mkdir`, `tar`, `man`, `help` and others.
- `cc`: `cc` and `c++` with `ld`, `ar` and `make`, and the headers and libraries they compile against.
- `amy`: `amy`, the package installer, and `dollyfile`, the recipe engine it runs.
- `nena`: `nena`, which lists a session's host modules and enables or disables them, where the image declares `nena@0`.
- `posix`: `grep`, `sed`, `sort`, `find`, `xargs`, `awk`, `sh` and the other text and file tools.
- `git`: `git` over the page's HTTP broker, with `diff` and `patch`.
- `zlib`: libz: zlib's headers and static library, for programs the `cc` package builds; it brings no compiler.
- `curl`: `curl` and libcurl, over the page's HTTP broker.
- `gzip`: `gzip -dc`, which unpacks a `.gz` file to standard output; the `pigz` package writes them.
- `less`: `less`, the pager; Git and `man` page through it once it is installed.
- `ninja`: `ninja` (Samurai), which Meson and CMake's Ninja generator build with.
- `make`: GNU `make` alone, for rules that compile nothing; `cc` brings it too.
- `zig`: `zig` with its standard library, and the `cc` package: it emits C (`-ofmt=c`) that `cc` compiles.
- `transfer`: `download` and `upload`, the page's file exchange.
- `ps`: `ps`, which lists the processes: PID, parent, state and command line.
- `session-recover`: `session-recover`, which copies the files of a saved session file into a new directory.
- `display`: the terminal: the Ghostty display plugin, its font and the termcap entry.
- `dolly-docs`: the platform's documents and machine contracts, in `/usr/share/doc/dolly`.

## Try it

Open [slopshare.dev](https://slopshare.dev/) or
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
(measured on 16 shared cores, on 2026-10-06 where no date is given):

| Edit | Check | Turnaround |
| --- | --- | --- |
| Scripts, Node-side code | `npm run test:source`, `npm run test:artifacts` | 20 s (2026-10-13), 2 s |
| Page JavaScript | `npm run dev`, reload; `npm run test:core` | 24-32 s Chrome, 32-68 s Firefox, the higher under load (2026-10-13) |
| Kernel C | `npm run build:runtime`, then `npm run test:core` | 9-12 s without changes |
| A recipe or its sources | `npm run image -- IMAGE` | 2 s when nothing changed (`default`); 9 s to rebuild `gzip` |
| Seed: headers, Slop, commands, libc adapter | every image rebuilds | 888 s for `default`, `cc`, `git` and `less`, 15 images (2026-10-13) |
| Before merging | `npm run test:browser` (`test/*-browser.mjs`), `npm run test:demos` (`demos/*/test/`) | 7 min for the core tests in both browsers, four files at a time (2026-10-14) |

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
