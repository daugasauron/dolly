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
- `nena`: `nena`, which lists a session's host modules and enables or disables them, where the image declares `nena@0`.
- `posix`: `grep`, `sed`, `sort`, `find`, `xargs`, `awk`, `sh` and the other text and file tools.
- `git`: `git` over the page's HTTP broker, with `diff` and `patch`.
- `zlib`: libz: zlib's headers and static library, for programs the `cc` package builds; it brings no compiler.
- `curl`: `curl` and libcurl, over the page's HTTP broker.
- `gzip`: `gzip -dc`, which unpacks a `.gz` file to standard output; the `pigz` package writes them.
- `less`: `less`, the pager; Git and `man` page through it once it is installed.
- `ninja`: `ninja` (Samurai), which Meson and CMake's Ninja generator build with.
- `mandoc`: `mandoc`, which formats a manual page of man or mdoc macros as text, and `text-page`, with which a package formats upstream's pages when it is built.
- `make`: GNU `make` alone, for rules that compile nothing; `cc` brings it too.
- `zig`: `zig` with its standard library, and the `cc` package: it emits C (`-ofmt=c`) that `cc` compiles.
- `transfer`: `download` and `upload`, the page's file exchange.
- `libdolly-gpu`: the `gpu@0` module's header and client library, for programs the `cc` package builds.
- `libdolly-audio`: the `audio@0` module's header and client library, for programs the `cc` package builds.
- `libdolly-microphone`: the `microphone@0` module's header and client library, for programs the `cc` package builds.
- `libdolly-sockets`: the `sockets@0` module's header and client library, for programs the `cc` package builds.
- `libdolly-touch`: the `touch@0` module's header and client library, for programs the `cc` package builds.
- `stack-wrap`: rewrites a program the `cc` package built so that it recurses deeper than one browser stack, with `stack@0`.
- `ps`: `ps`, which lists the processes: PID, parent, state and command line.
- `session-recover`: `session-recover`, which copies the files of a saved session file into a new directory.
- `display`: the terminal: the Ghostty display plugin, its font and the termcap entry.
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

A page of your own that runs the Pi coding agent, served from your machine, whose
requests the browser admits to the model's provider and nowhere else. In an empty
directory, with Node.js and npm:

```sh
npm init --yes
npm install @daugasauron/dolly @daugasauron/dolly-image-pi-agent \
  @daugasauron/dolly-host-display @daugasauron/dolly-host-input @daugasauron/dolly-host-audio \
  @daugasauron/dolly-host-touch @daugasauron/dolly-host-save @daugasauron/dolly-host-upload
```

`index.html` boots `pi-agent` with an [HTTP policy](docs/http.md) of one rule:
OpenRouter's API. The broker refuses every other request, whatever Pi or a
program it runs asks for.

```html
<!doctype html>
<meta charset="utf-8">
<main id="dolly" style="position:fixed;inset:0"></main>
<script type="module">
  import { boot } from "./node_modules/@daugasauron/dolly/src/browser.mjs";
  import { images, image, modules } from "./node_modules/@daugasauron/dolly-image-pi-agent/index.mjs";
  const policy = { rules: [
    { origin: "https://openrouter.ai", pathPrefix: "/api/v1/", methods: ["GET", "POST"], credentialHeaders: ["authorization"] },
  ] };
  await boot(document.querySelector("#dolly"), { images, image, modules, http: { policy } });
</script>
```

`serve.mjs` serves the directory with the cross-origin isolation Dolly needs:

```js
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".wasm": "application/wasm" };
const server = createServer(async (request, response) => {
  try {
    const path = join(process.cwd(), normalize(decodeURIComponent(new URL(request.url, "http://localhost").pathname)));
    const body = await readFile(path.endsWith("/") ? join(path, "index.html") : path);
    response.writeHead(200, { "content-type": types[extname(path) || ".html"] ?? "application/octet-stream",
      "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp" });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(Number(process.env.PORT ?? 8080), "127.0.0.1", () => console.log(`http://127.0.0.1:${server.address().port}/`));
```

Run `node serve.mjs` and open the address it prints. Pi starts; leave it with
Ctrl+D for a shell, where `pi-key OPENROUTER_API_KEY --provider openrouter`
reads your key without showing it and starts Pi with it, and `/model` picks a
model. The key stays in that Pi's environment. `curl https://example.com`
in the shell fails: the policy refuses it. [An agent in place of a web
frontend](docs/agent-frontend.md) adds skills and an API of your own.

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
(measured on 16 shared cores, on 2026-10-06 where no date is given):

| Edit | Check | Turnaround |
| --- | --- | --- |
| Scripts, Node-side code | `npm run test:source`, `npm run test:artifacts` | 20 s, 24 s (2026-10-14) |
| Page JavaScript | `npm run dev`, reload; `npm run test:core` | 24-32 s Chrome, 32-68 s Firefox, the higher under load (2026-10-13) |
| Kernel C | `npm run build:runtime`, then `npm run test:core` | 9-12 s without changes |
| A recipe or its sources | `npm run image -- IMAGE` | 3 s when nothing changed (`default`, 2026-10-14); 9 s to rebuild `gzip` |
| Seed: headers, Slop, commands, libc adapter | every image rebuilds | 888 s for `default`, `cc`, `git` and `less`, 15 images (2026-10-13) |
| Before merging | `npm run test:browser` (`test/*-browser.mjs`), `npm run test:demos` (`demos/*/test/`) | 7 min for the core tests in both browsers, four files at a time (2026-10-14) |

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
`SPDX-License-Identifier: GPL-2.0-or-later`: the Seven Kingdoms port compiled
into the game (`demos/rts`: `Makefile`, `OAUDIO.h`, `arena.*`, `config.h`,
`input.*`) and `demos/zero-ad/engine.patch`. Bundled upstream programs keep
their own [licences](docs/licences.md).
