---
name: dolly
description: How to work on this Dolly machine, a Unix-like userspace inside a browser's WebAssembly sandbox - finding what is installed, amy packages, what the network reaches and how to get source without git clone, Slop shell idioms, parallel make, cc and Dolly's headers, Janis JavaScript, exit status 126. Read before installing software, fetching source, compiling, or explaining a command that failed.
---

# Dolly

Everything here (shell, processes, files) runs in WebAssembly inside one
browser tab. Files live in memory: reloading the tab loses them unless the user
saves a session (Ctrl+Shift+S). There is no host filesystem, no sockets, no
root, no PTY and no `apt`, `npm` or `pip install`.

## What this machine has

- `cat /etc/dolly/Dollyfile`: the recipe this image was built from. Its
  `REQUIRES HOST` lines are the host modules (display, http, threads, gpu...)
  that programs here may use. `/etc/dolly/recipes/` holds the recipes it came from.
- `ls /bin /usr/bin`: every command. Read a command's usage before assuming
  GNU options; options go before operands (`ls -a /etc`).
- `amy list` shows the packages this release publishes; `amy install NAME`
  installs one (python, nvim, emacs, ripgrep, local models...) and its commands
  work at once. If amy says the image must declare `packages@0`, this image
  cannot install packages.
- Dolly's C interfaces: the headers in `/usr/include/dolly/`, whose comments
  are the documentation. Licences: `/usr/share/licenses/`.
- Dolly's own source and docs are not in the image; read them at
  `https://raw.githubusercontent.com/daugasauron/dolly/main/` (`README.md`, `docs/`).

## Network

All HTTP goes through the browser, so a host answers only if the page's policy
allows it and it sends CORS headers. Check a host before planning around it:
`curl -sS -o /dev/null -w '%{http_code}\n' URL`. Usually
raw.githubusercontent.com, api.github.com, cdn.jsdelivr.net,
data.jsdelivr.com, registry.npmjs.org and pypi.org work, while github.com and
codeload.github.com do not: `git clone`, `git fetch` and GitHub archive
downloads fail. "Browser HTTP broker could not connect" means blocked or
unreachable; another spelling of the same host will not help. Never send
credentials through a public CORS proxy.

- One file: `curl -fsSLO https://raw.githubusercontent.com/OWNER/REPO/REF/PATH`
- A tree: list its files with
  `janis -m -e 'const r = await fetch("https://data.jsdelivr.com/v1/packages/gh/OWNER/REPO@REF?structure=flat"); for (const f of (await r.json()).files) console.log(f.name.slice(1))'`,
  then fetch each from `https://cdn.jsdelivr.net/gh/OWNER/REPO@REF/PATH`.
- An npm tarball: `curl -fsSL URL | gzip -dc - | tar -xf - -C DIR` (tar only
  extracts and has no `-z`).
- `curl --help` lists the options it has.

## Shell

The `bash` tool, `!`, `sh` and `make` all run Slop, not Bash. `help` prints
exactly the syntax it supports; anything else is an error, so check it before
reaching for Bash features. Pipeline stages run one after another, so
`make | tail` shows nothing until make ends.
Put longer scripts in a file with the write tool and run `slop FILE`. Nobody
is at the keyboard of the tool's commands: never start interactive programs
(nvim, pi, python without arguments) there, and bound anything that might wait
or hang with `timeout 60 COMMAND`.

There are no background jobs (`&`): `make -jN` is the way to run N processes
at once (`xargs -P` is serial).
To fetch many files, list them in `files.txt` and run `make -j8 -f fetch.mk`:

```make
.RECIPEPREFIX = >
FILES := $(shell cat files.txt)
all: $(FILES)
$(FILES):
>@mkdir -p $(dir $@) && curl -fsS https://cdn.jsdelivr.net/gh/OWNER/REPO@REF/$@ -o $@
```

## C and C++

`cc` and `c++` are Clang for wasm64, with `make`, `ninja` and `ar`; `cc -c`
takes one source file. Upstream `./configure` scripts usually need more shell
than Slop has: compile the sources directly or write a small Makefile. `-lm`, `-lz` and `-lcurl` (libcurl over the browser)
link from `/usr/lib`. To use a Dolly interface (`display.h` draws on the
terminal's canvas), include its header from `/usr/include/dolly/`: its client
library links automatically, with no `-l`. The program then runs only in images whose recipe declares that
module, and `-pthread` needs `threads@0`. Time code with
`clock_gettime(CLOCK_MONOTONIC)`.

A program that exits 126 could not run. Usually it uses a host module this
image does not declare: compare the `dolly/*.h` headers it includes, or what
`strings PROGRAM | grep dolly.host` prints (`dolly.hostgpu` needs `gpu@0`),
with the `REQUIRES HOST` lines of `/etc/dolly/Dollyfile`. Nothing inside an
image adds a module: the program needs an image whose recipe declares it.

## JavaScript

`janis` (also `qjs`) is QuickJS with Node-style ES modules: write `.mjs` files
or use `janis -m -e '...'`. `require` and worker threads do not exist;
`import fs from "node:fs"` and `fetch` work. `tsc` compiles TypeScript. Without
npm, use dependency-free modules, for example from `https://cdn.jsdelivr.net/npm/`.
