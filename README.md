# Dolly

> "So here's the GIMP running inside Chrome with Chrome inside Firefox."
>
> Gary Bernhardt, [The Birth & Death of JavaScript](https://www.destroyallsoftware.com/talks/the-birth-and-death-of-javascript), PyCon 2014

Dolly is a tribute to that talk. Progress on his timeline, as of 2026:

- **2013, asm.js:** done, then quietly replaced by WebAssembly.
- **The late teens, the dev tools move in:** a shell, CPython, Git, a C
  compiler, Emacs, Neovim.
- **The war:** we don't talk about the war.
- **2025, "thick, extremely large applications":** 0 A.D., Xonotic, and GIMP
  inside Wine inside Dolly inside Chrome. One layer deeper, one year late.
- **METAL:** in progress. Kernel inside the VM: done. VM inside the kernel:
  next.
- **The death of JavaScript:** the page that boots Dolly is written in it.
  Don't tell anyone.

Dolly is a modular POSIX-ish userspace that runs in a browser tab. It builds
itself: you only need a compiler. From a wasm64 kernel and a C/C++ compiler,
the recipes build everything else in the tab from upstream source: the shell,
Make, Git, CPython, Zig, and the terminal, a framebuffer drawn by Ghostty's VT
library built with that Zig. The [LLVM demo](demos/llvm/README.md) rebuilds
the compiler and gets the same bytes back.

The exception is Rust. Rust is written in Rust, so its first compiler comes
from outside. After an LLVM, two rustc generations and fifty minutes of
building, you get a better grep.

What it can do is shown by what has been ported ([demos](demos/README.md)):
CPython, Git, Emacs, Neovim, tmux, Rust and Cargo, CMake, LLVM, Codex, Pi,
Claude Code, Wine with Paint, NetSurf and GIMP, 0 A.D. and Xonotic.

It is one sandbox. Programs reach the browser only through a fixed set of
host modules, and the network only through one HTTP(S) broker, managed on the
browser side ([boundary](#boundary)).

The core is the modular runtime (kernel, host modules, process model, ABI,
trusted browser code) and a small POSIX-ish userspace that packages extend.
Everything else is a demo in `demos/`; the core never depends on one. See
[AGENTS.md](AGENTS.md) and the [architecture](docs/architecture.md).

Maybe everything was already written once to run anywhere.

## Core images

Every image declares its role: an `APPLICATION` people open, a `TOOLCHAIN`
recipes build on, or a `PACKAGE` recipes and sessions install
([Dollyfile](docs/dollyfile.md#roles-and-names)).

- `default`: A shell, its text tools, ps, amy, which installs the rest, curl among it, and nena, which enables the host modules they need.
- `system`: `system-tools` with saved sessions (`snapshot@0`, `session-recover`).
- `system-tools`: Shell, display, Git, Make and POSIX tools.
- `system-build`: C/C++ compiler, headers and basic build tools.
- `zig-build`: Zig built from source by the C/C++ compiler; emits C.
- `ghostty-build`: Ghostty terminal build with Zig and its SDK.
- `core`: the shell `slop` and its core commands: `ls`, `cat`, `cp`, `mv`, `rm`, `mkdir`, `tar`, `man`, `help` and others.
- `cc`: `cc` and `c++` with `ld`, `ar` and `make`, and the headers and libraries they compile against.
- `amy`: `amy`, the package installer, and `dollyfile`, the recipe engine it runs.
- `dollyfile`: `dollyfile`, the recipe engine alone: an image that installs it can be built `FROM`.
- `nena`: `nena`, which lists a session's host modules and enables or disables them, where the image declares `nena@0`.
- `posix`: `grep`, `sed`, `sort`, `find`, `xargs`, `awk`, `sh` and the other text and file tools.
- `git`: `git`, with `diff` and `patch`, and `vi` for the messages it edits; `git-http` adds its HTTP and HTTPS remotes.
- `git-http`: Git's HTTP and HTTPS remote helpers over the page's HTTP broker, for `git clone` of an `https://` URL.
- `zlib`: libz: zlib's headers and static library, for programs the `cc` package builds; it brings no compiler.
- `curl`: `curl` and libcurl, over the page's HTTP broker.
- `gzip`: `gzip`, which compresses and decompresses `.gz` files with zlib.
- `less`: `less`, the pager; Git and `man` page through it once it is installed.
- `vi`: Neatvi, a small `vi` and `ex` that needs no terminal database; Git starts it to edit a message.
- `ninja`: `ninja` (Samurai), which Meson and CMake's Ninja generator build with.
- `mandoc`: `mandoc`, which formats a manual page of man or mdoc macros as text, and `text-page`, with which a package formats upstream's pages when it is built.
- `make`: GNU `make` alone, for rules that compile nothing; `cc` brings it too.
- `zig`: `zig` with its standard library, and the `cc` package: it emits C (`-ofmt=c`) that `cc` compiles.
- `transfer`: `download` and `upload`, the page's file exchange.
- `clip`: `clip`, which copies its standard input to the page's clipboard: the end of a pipeline, or tmux's `copy-pipe`.
- `html`: `html`, which shows the user an HTML page or form in a popup and prints what they submit, and the `html@0` module's header and client library.
- `libdolly-gpu`: the `gpu@0` module's header and client library, for programs the `cc` package builds.
- `libdolly-audio`: the `audio@0` module's header and client library, for programs the `cc` package builds.
- `libdolly-microphone`: the `microphone@0` module's header and client library, for programs the `cc` package builds.
- `libdolly-sockets`: the `sockets@0` module's header and client library, for programs the `cc` package builds.
- `libdolly-touch`: the `touch@0` module's header and client library, for programs the `cc` package builds.
- `libdolly-clipboard`: the `clipboard@0` module's header and client library, for programs the `cc` package builds.
- `libdolly-display`: the `display@0` module's header and client library, for programs the `cc` package builds.
- `libdolly-input`: the `input@0` module's header and client library, for programs the `cc` package builds.
- `libdolly-download`: the `download@0` module's header and client library, for programs the `cc` package builds.
- `libdolly-upload`: the `upload@0` module's header and client library, for programs the `cc` package builds.
- `libdolly-threads`: the `threads@0` module's header, for a program that calls the thread interface itself; `cc -pthread` links its client.
- `libdolly-nena`: the `nena@0` module's header and client library, for programs the `cc` package builds.
- `libdolly-packages`: the `packages@0` module's header and client library, for programs the `cc` package builds.
- `libdolly-pty`: the `pty@0` module's header and client library, for programs the `cc` package builds; a program links it with `-ldolly-pty`.
- `stack-wrap`: rewrites a program the `cc` package built so that it recurses deeper than one browser stack, with `stack@0`.
- `ps`: `ps`, which lists the processes: PID, parent, state and command line.
- `session-recover`: `session-recover`, which copies the files of a saved session file into a new directory.
- `display`: the terminal: the Ghostty display plugin, its fonts and the termcap entry.
- `dolly-docs`: the platform's documents and machine contracts, in `/usr/share/doc/dolly`.

## Try it

Open [slopshare.dev](https://slopshare.dev/). The menu lists every image.

In a page of your own: `npm install @daugasauron/dolly @daugasauron/dolly-image-default`
with the host modules it declares ([Embedding](docs/embedding.md) gives the line),
or [Pi with npm](#pi-with-npm) below.

- `/IMAGE/` boots the prebuilt image; `/IMAGE/rebuild/` builds it from its
  Dollyfile in your browser; `/view/IMAGE/` shows the recipe.
- `/custom/` builds your own [Dollyfile](docs/dollyfile.md); `/sessions/` lists
  [saved sessions](docs/sessions.md) and `/session/?name=NAME` opens one.
- `Ctrl+Shift+C`/`V` copy and paste, `Ctrl+Shift+S` saves, `F11` toggles
  fullscreen. `Ctrl+Shift+F` shows or hides the page's own indicators (GPU
  adapter, download offers), which leave the corners ten seconds after
  the page is ready. `upload PATH` and `download FILE` move single files.
- Needs cross-origin isolation and shared WebAssembly memory64/table64; there is
  no wasm32 fallback.

## Pi with npm

A site of your own that runs the Pi coding agent in a sandbox with the tools
you choose (Git, Python, Neovim and others) and your skills, whose requests
the browser admits to the model's provider and nowhere else:

```sh
npm install @daugasauron/dolly-build
npx dolly-build init my-pi git python nvim
npx dolly-build Dollyfile-my-pi my-pi
python3 -m http.server -d my-pi -b 127.0.0.1 8080
```

`npm install` and `init` are the only steps that download anything. `my-pi/`
is a static site, and `init` writes the workflow that builds it in CI.
[Dolly from npm](docs/npm.md) is the guide: the project's files, tools,
skills, the policy, CI, serving and updating; the
[npm changelog](docs/npm-changelog.md) lists what changed in the packages, and
[Upgrading](docs/npm-upgrading.md) moves a 0.1.5 project to 0.1.7.
[Data Pi](demos/pi/data-pi/README.md) is such a project, and
[An agent in place of a web frontend](docs/agent-frontend.md) goes on from
there: your backend's API, your model provider and how Pi starts.

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
npm run build:runtime                 # kernel and seed, with the pinned compiler; checks the exact ABI
npm run image -- default --plan       # show what would rebuild
npm run image -- default              # build an image and what it needs
npm run dev -- default                # serve this checkout and dist/ (DOLLY_PORT)
npm run image -- default --package    # also seal a local release for npm run serve
```

Image builds rewrite SHA-256 pins in `Dollyfile*`. Check by what you changed
(measured on 16 shared cores, busy with other builds):

| Edit | Check | Turnaround |
| --- | --- | --- |
| Scripts, Node-side code | `npm run test:source`, `npm run test:artifacts` | 30 s for the first (2026-11-02) |
| Page JavaScript | `npm run dev`, reload; `npm run test:core` | 28 s Chrome, 39 s Firefox (2026-11-02) |
| Kernel C | `npm run build:runtime`, then `npm run test:core` | 15 s without changes (2026-11-02) |
| A recipe or its sources | `npm run image -- IMAGE` | 3 s when nothing changed (`default`); `gzip` builds in 4 s (2026-11-02) |
| Seed: headers, Slop, commands, libc adapter | every image rebuilds | 970 s for `default`, `cc`, `git` and `less`, 19 images, one browser at a time (2026-11-02) |
| Before merging | `npm run test:browser` (`test/*-browser.mjs`), `npm run test:demos` (`demos/*/test/`) | 1049 s for the core tests in both browsers, 161 runs, four files at a time (2026-11-15) |

## Docs

- [Architecture](docs/architecture.md): components, system calls, core images.
- [Dolly from npm](docs/npm.md): the npm packages, `dolly-build`, an agent of your own, CI; its [changelog](docs/npm-changelog.md); [upgrading](docs/npm-upgrading.md) from 0.1.5.
- [Embedding](docs/embedding.md): `boot()`, a page of your own, serving it.
- [Agent frontend](docs/agent-frontend.md): Pi, skills and a policy in place of a web frontend.
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
`SPDX-License-Identifier: GPL-2.0-or-later`, which are compiled into GPL games,
and `LGPL-2.1-or-later`, which are compiled into Wine.
Bundled upstream programs keep their own [licences](docs/licences.md).
