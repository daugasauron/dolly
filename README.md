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

- `default`: A shell, its text tools, curl, ps, amy, which installs the rest, and nena, which enables the host modules they need.
- `system`: `system-tools` with saved sessions (`snapshot@0`, `session-recover`).
- `system-tools`: Shell, display, Git, curl, Make and POSIX tools.
- `system-build`: C/C++ compiler, headers and basic build tools.
- `zig-build`: Zig built from source by the C/C++ compiler; emits C.
- `ghostty-build`: Ghostty terminal build with Zig and its SDK.
- `core`: the shell `slop` and its core commands: `ls`, `cat`, `cp`, `mv`, `rm`, `mkdir`, `tar`, `man`, `help` and others.
- `cc`: `cc` and `c++` with `ld`, `ar` and `make`, and the headers and libraries they compile against.
- `amy`: `amy`, the package installer, and `dollyfile`, the recipe engine it runs.
- `dollyfile`: `dollyfile`, the recipe engine alone: an image that installs it can be built `FROM`.
- `nena`: `nena`, which lists a session's host modules and enables or disables them, where the image declares `nena@0`.
- `posix`: `grep`, `sed`, `sort`, `find`, `xargs`, `awk`, `sh` and the other text and file tools.
- `git`: `git` over the page's HTTP broker, with `diff` and `patch`.
- `zlib`: libz: zlib's headers and static library, for programs the `cc` package builds; it brings no compiler.
- `curl`: `curl` and libcurl, over the page's HTTP broker.
- `gzip`: `gzip`, which compresses and decompresses `.gz` files with zlib.
- `less`: `less`, the pager; Git and `man` page through it once it is installed.
- `ninja`: `ninja` (Samurai), which Meson and CMake's Ninja generator build with.
- `mandoc`: `mandoc`, which formats a manual page of man or mdoc macros as text, and `text-page`, with which a package formats upstream's pages when it is built.
- `make`: GNU `make` alone, for rules that compile nothing; `cc` brings it too.
- `zig`: `zig` with its standard library, and the `cc` package: it emits C (`-ofmt=c`) that `cc` compiles.
- `transfer`: `download` and `upload`, the page's file exchange.
- `html`: `html`, which shows the user an HTML page or form in a popup and prints what they submit, and the `html@0` module's header and client library.
- `libdolly-gpu`: the `gpu@0` module's header and client library, for programs the `cc` package builds.
- `libdolly-audio`: the `audio@0` module's header and client library, for programs the `cc` package builds.
- `libdolly-microphone`: the `microphone@0` module's header and client library, for programs the `cc` package builds.
- `libdolly-sockets`: the `sockets@0` module's header and client library, for programs the `cc` package builds.
- `libdolly-touch`: the `touch@0` module's header and client library, for programs the `cc` package builds.
- `stack-wrap`: rewrites a program the `cc` package built so that it recurses deeper than one browser stack, with `stack@0`.
- `ps`: `ps`, which lists the processes: PID, parent, state and command line.
- `session-recover`: `session-recover`, which copies the files of a saved session file into a new directory.
- `display`: the terminal: the Ghostty display plugin, its fonts and the termcap entry.
- `dolly-docs`: the platform's documents and machine contracts, in `/usr/share/doc/dolly`.

## Try it

Open [slopshare.dev](https://slopshare.dev/) or
[GitHub Pages](https://daugasauron.github.io/dolly/). The menu lists every image.

In a page of your own: `npm install @daugasauron/dolly @daugasauron/dolly-image-default`
and [Embedding](docs/embedding.md), or [Pi with npm](#pi-with-npm) below.

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

## Pi with npm

A page of your own that runs the Pi coding agent on your project, served from
your machine, whose requests the browser admits to the model's provider and
nowhere else. In an empty directory, with Node.js, npm and Chrome:

```sh
npm init --yes
npm install @daugasauron/dolly @daugasauron/dolly-image-pi-minimal @daugasauron/dolly-build \
  @daugasauron/dolly-host-display @daugasauron/dolly-host-input @daugasauron/dolly-host-save \
  @daugasauron/dolly-host-html @daugasauron/dolly-package-git
npx dolly-build init my-pi git
npx dolly-build Dollyfile-my-pi my-pi
node serve.mjs
```

`init` writes the project; the second `dolly-build` builds its image in your
Chrome (headless, 10 to 30 s; `--browser firefox` after `npx playwright-core install firefox`),
and `serve.mjs` serves the page. Open the address it prints: Pi asks for your
OpenRouter key at a prompt that does not show it, and starts in `/workspace`
with Git and the project's files. `curl https://example.com` in Pi's shell
fails: the policy refuses it.

| File | What it declares | After a change |
| --- | --- | --- |
| `Dollyfile-my-pi` | The sandbox, a [recipe](docs/dollyfile.md) `FROM` `pi-minimal`: `INSTALL` rows for the packages you named (`git`, `python`, `cc`), `FILE` rows with Pi's `AGENTS.md`, a skill, an extension with a `/hello` command, a `todo` tool, and the script that starts Pi with its provider | Build again |
| `index.html` | The hosts the agent may reach ([HTTP policy](docs/http.md)): one rule, OpenRouter's API. The popups' colours. The files written into `/workspace` | Reload |
| `workspace/` | The project the agent works on, written into `/workspace` at each boot | Reload |
| `serve.mjs` | Serving with cross-origin isolation and the listing of `workspace/` (`workspace.json`); the hosts it relays for programs that need one without CORS headers ([relays](docs/http.md#cors-and-relays)). A static host sends the two headers ([Embedding](docs/embedding.md), "Serving") and holds the listing as a file | Restart |

`pi-minimal` is Pi with a shell, POSIX tools, curl, ripgrep and fd; the page gives
it a terminal (`display`), a keyboard (`input`), Pi's download tool (`save`) and the
popup its `ask_user` and `show_html` tools show (`html`), and nothing else of the
browser. A package's host modules join the recipe's `REQUIRES HOST` rows and the
page's install line: `python` needs `@daugasauron/dolly-host-sockets`.

[An agent in place of a web frontend](docs/agent-frontend.md) goes on from here:
your company's instructions and skills, your backend's API, your model provider
(Bedrock, Copilot, a gateway of your own) and how Pi starts.

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
| Before merging | `npm run test:browser` (`test/*-browser.mjs`), `npm run test:demos` (`demos/*/test/`) | 442 s for the core tests in both browsers, four files at a time (2026-10-31) |

## Docs

- [Architecture](docs/architecture.md): components, system calls, core images.
- [Embedding](docs/embedding.md): the npm packages, `boot()`, serving a page.
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
`SPDX-License-Identifier: GPL-2.0-or-later`, which are compiled into GPL games.
Bundled upstream programs keep their own [licences](docs/licences.md).
