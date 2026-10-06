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
- `ls /bin /usr/bin`: every command. Read its page (`man NAME`) or usage
  (`NAME --help`) before assuming GNU options; options go before operands
  (`ls -a /etc`).
- `amy list` shows the packages this release publishes; `amy install NAME`
  installs one (python, nvim, emacs, ripgrep, local models...) and its commands
  work at once. If amy says the image must declare `packages@0`, this image
  cannot install packages.
- Dolly's C interfaces: the headers in `/usr/include/dolly/`, whose comments
  are the documentation. Licences: `/usr/share/licenses/`.
- The platform's documents and machine contracts are in
  `/usr/share/doc/dolly/` (`docs/`, `abi/`, `host/`); `amy install dolly-docs` adds
  them to an image that lacks them. Dolly's source is not in the image.

## Network

All HTTP goes through the browser, so a host answers only if the page's policy
allows it and it sends CORS headers. Check a host before planning around it:
`curl -sS -o /dev/null -w '%{http_code}\n' URL`. Usually
raw.githubusercontent.com, api.github.com, cdn.jsdelivr.net,
data.jsdelivr.com, registry.npmjs.org and pypi.org work, while github.com,
gitlab.com, codeberg.org and codeload.github.com send no CORS headers.
"Browser could not fetch the URL" (curl status 7) means the host sends none or
is unreachable, and another spelling of the same host will not help; status 9
means this page's policy refused it. Never send credentials through a public
CORS proxy.

`git clone https://github.com/OWNER/REPO` is real Git and works, with history,
fetch and push, only where the page was set up with a relay for that host; the
public Dolly sites have none. Try it once: it answers within a second. If it
says "Browser could not fetch the URL", there is no relay and no Git option
will change that; take a snapshot of the files instead (below), and if you
need version control run `git init -q . && git add -A && git commit -qm snapshot`
there. That repository has no upstream history and cannot fetch or push; say
so when it matters to the task.

- One file: `curl -fsSLO https://raw.githubusercontent.com/OWNER/REPO/REF/PATH`
- A tree: list its files with
  `janis -m -e 'const r = await fetch("https://data.jsdelivr.com/v1/packages/gh/OWNER/REPO@REF?structure=flat"); for (const f of (await r.json()).files) console.log(f.name.slice(1))'`,
  then fetch each from `https://cdn.jsdelivr.net/gh/OWNER/REPO@REF/PATH`.
- An npm tarball: `curl -fsSL URL | gzip -dc - | tar -xf - -C DIR` (tar only
  extracts and has no `-z`).
- `curl --help` lists the options it has.

## Shell

The `bash` tool, `!`, `sh` and `make` all run Slop, not Bash. `help` says
what Slop lacks and `docs/slop.md`, among the documents above, is exactly the
syntax it supports; anything else is an error, so check before reaching for
Bash features. The programs of a pipeline run at the same time
(`make | tee log` streams, `... | head` stops its producer); a `while` loop or
function as a stage finishes before the next stage reads its output.
Put longer scripts in a file with the write tool and run `slop FILE`. Nobody
is at the keyboard of the tool's commands: never start interactive programs
(nvim, pi, python without arguments) there, and bound anything that might wait
or hang with `timeout 60 COMMAND`.

`PROGRAM &` starts a program, `$!` is its PID and `wait` collects it; there is
no job control, and `&` takes only programs (`slop -c '...' &` for the rest).
`make -jN` and `xargs -P N` run N processes at once.
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
takes one source file. `cc file.c` writes `a.out`: name the program and run it
in the same command, `cc -o NAME file.c && ./NAME`, because every `bash` call
starts in Pi's working directory again. It runs whatever mode `ls -l` shows:
there is no `chmod`. Every program here, `cc` included, is a WebAssembly
module, as `file` says: never `cat` one. Upstream `./configure` scripts usually need more shell
than Slop has: compile the sources directly or write a small Makefile. `-lm`, `-lz` and `-lcurl` (libcurl over the browser)
link from `/usr/lib`. To use a Dolly interface (`display.h` draws on the
terminal's canvas), include its header from `/usr/include/dolly/`: its client
library links automatically, with no `-l`. The program then runs only in images whose recipe declares that
module, and `-pthread` needs `threads@0`. Time code with
`clock_gettime(CLOCK_MONOTONIC)`.

A program that exits 126 was refused or crashed, and one line on its stderr
says why, usually a host module this image's recipe does not declare
(`REQUIRES HOST` in `/etc/dolly/Dollyfile`). Nothing inside an image adds a
module: the program needs an image whose recipe declares it.

## JavaScript

`janis` (also `qjs`) is QuickJS with Node's module rules: `.mjs` files and code
using `import` are ES modules, other files and `-e` are CommonJS with
`require`. `fetch` and the `node:` built-ins work; worker threads do not exist. `tsc` compiles TypeScript. Without
npm, use dependency-free modules, for example from `https://cdn.jsdelivr.net/npm/`.
