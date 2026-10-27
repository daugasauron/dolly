---
name: dolly
description: How to do things on this Dolly machine (a POSIX-like wasm64 userspace in a browser tab) - packages with amy, host modules with nena, fetching source without git clone, Slop shell idioms, parallel make, C with Dolly's headers (display, input), games with the sdl2 and raylib packages, Rust crates without the index, Go, Janis JavaScript, moving files with download and upload, and why a command failed (status 126, 127, curl 7 and 9). Read it before such a task.
---

# Dolly

Everything here (shell, processes, files) runs in WebAssembly inside one
browser tab. Files live in memory: reloading the tab loses them unless the user
saves the session (Ctrl+Shift+S) or downloads them. There is no host
filesystem, no sockets to the outside, no root and no `apt`, `npm` or
`pip install` before `amy install python`.

## What this machine has

- `cat /etc/dolly/Dollyfile`: the recipe this image was built from. Its
  `REQUIRES HOST` lines are the host modules (display, input, http, threads,
  gpu, dso, sockets...) that programs here may use. `/etc/dolly/recipes/`
  holds the recipes it came from.
- `ls /bin /usr/bin`: every command. Read its page (`man NAME`) or usage
  (`NAME --help`) before assuming GNU options; options go before operands
  (`ls -a /etc`). `help` is the shell's own summary.
- `amy list` shows the packages this release publishes, `amy info NAME` one of
  them, and `amy install NAME` installs it; its commands work at once. If amy
  says the image must declare `packages@0`, this image cannot install packages.
- `amy install` refuses a package whose host module this image lacks:
  "needs dso@0: add REQUIRES HOST dso@0" (`python` needs `dso@0` and
  `sockets@0`). Where `nena` exists (the image declares `nena@0`, as `default`
  does), `nena` lists the page's modules and `nena enable dso sockets` adds them
  for the session. Elsewhere nothing inside the image adds one: say that the
  task needs an image that declares it.
- Processes: `cat /proc/processes` (PID, parent, state, command), or `ps` after
  `amy install ps`; `kill PID`. There is no other `/proc`.
- Dolly's C interfaces: the headers in `/usr/include/dolly/`, whose comments
  are the documentation. Licences: `/usr/share/licenses/`.
- The platform's documents and machine contracts are in
  `/usr/share/doc/dolly/` (`docs/`, `abi/`, `host/`); `amy install dolly-docs` adds
  them to an image that lacks them. Dolly's source is not in the image.

## Files in and out

- `download FILE` (or Pi's `download` tool) offers one file to the user's
  browser, which saves it when the user clicks Save; use it only when asked.
- `upload PATH` asks the user to pick a file and writes it to `PATH`; an
  existing file is never replaced.
- Several files: `tar` here only extracts and `gzip` only decompresses. Git
  writes archives of any directory:
  `git init -q . && git add -A && git archive -o out.tar.gz $(git write-tree)`
  (`.tar`, `.tar.gz` or `.zip`). `amy install tar` brings a `tar` that writes
  `.tar`; its `-z` fails here.

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

`git clone https://github.com/OWNER/REPO` is real Git and works, with history
and fetch, only where the page was set up with a relay for that host; the
public Dolly sites have none. Try it once: it answers within a second. If it
says "Browser could not fetch the URL", there is no relay and no Git option
will change that; take a snapshot of the files instead (below), and if you
need version control run `git init -q . && git add -A && git commit -qm snapshot`
there. That repository has no upstream history and cannot fetch or push; say
so when it matters to the task. `git push` does not work here, to a relay or
to a local repository: push reads the other side's progress in a second
process or thread, which this Git cannot start ("fork (async) failed"). To
move commits between local repositories, fetch from the receiving one
(`git -C DEST fetch SOURCE BRANCH:BRANCH`).

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
(nvim, pi, python without arguments) there, check a game or other display
program with `timeout 5 ./game` (status 124: it ran until the limit), and bound
anything else that might wait or hang with `timeout 60 COMMAND`.

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
terminal's canvas, `input.h` reads keys and the pointer), include its header from `/usr/include/dolly/`: its client
library links automatically, with no `-l`. The program then runs only in images whose recipe declares that
module, and `-pthread` needs `threads@0`. A program that draws or reads keys
needs the terminal: build it with the tool, and the user runs it from Slop.
Time code with `clock_gettime(CLOCK_MONOTONIC)`.

## Games and graphics

Libraries are packages too: `amy list` names them, `amy install` adds them
to the running session, and `cc` links them at once.

- `sdl2`: SDL 2 drawing in software on the terminal's canvas, with keyboard
  and mouse events, `SDL_GetTicks`, `SDL_Delay` and sound: `#include <SDL2/SDL.h>`,
  link `-lSDL2 -lm`. Every renderer is the software one, whatever the flags
  ask, and `SDL_RenderPresent` does not wait for the display: pace the loop
  with `SDL_Delay` or the frame time. SDL starts no threads here, so its audio
  callback runs while the program pumps events (`SDL_PollEvent` each frame) and
  a program that stops pumping goes silent. There is no `SDL_AddTimer` and no
  game controller. Its programs need the `touch@0` and `audio@0` modules; where
  an image does not declare them, `nena enable touch audio` first. `imgui` adds
  Dear ImGui on it.
- `sdl2-mixer` (sound effects and music: WAV, Ogg Vorbis, MP3, FLAC),
  `sdl2-ttf` (text in a TrueType font) and `sdl2-image` (PNG, JPEG, GIF, BMP and
  more) are SDL_mixer, SDL_ttf and SDL_image on `sdl2`. With `amy install pkgconf`,
  `cc $(pkg-config --cflags SDL2_mixer) game.c $(pkg-config --static --libs SDL2_mixer)`
  names every flag; list each library you use.
- `raylib`: raylib 6 in software with upstream's own API: `InitWindow` draws on
  the terminal's canvas, `IsKeyDown` and the other input calls read the
  keyboard and pointer, `GetTouchPointCount` and the gestures the fingers
  (`touch@0`, as for `sdl2`), `GetTime`, `SetTargetFPS` and `WindowShouldClose`
  work; link `-lraylib -lm`. Its audio module is not built: for sound, use `sdl2` with
  `sdl2-mixer`. `<dolly/raylib.h>` (`-ldolly-raylib`) serves a program that holds
  the display itself.
- Others, such as `box3d` (3D physics), `freetype`, `libpng`, `libjpeg` and
  `sqlite`: `amy files NAME` lists their headers, archives and any `.pc`
  file, which names the flags (`pkg-config` comes with `amy install pkgconf`).
- Fonts for a program's text are in `/usr/share/fonts`: `IosevkaTerm-SemiBold.ttf`
  (the terminal's, monospace), `DroidSansFallback.ttf` (CJK) and
  `NotoEmoji-Regular.ttf`; FreeType and raylib's `LoadFontEx` read them.
- Sound needs the `audio@0` host module (`<dolly/audio.h>` from
  `libdolly-audio`; `openal` mixes for it); without it, a game is silent.

## When a command fails

- Status 127, "command not found": not installed. `amy list` may have it;
  there is no `apt`, `pip` or `npm` to fall back on. Ask with `command -v NAME`
  (status 1 when missing); `which NAME` ends with 2 and "not an external
  command", which means the same.
- Status 126: the program was refused or crashed, and one line on its stderr
  says why, usually a host module this image does not declare (above).
- "Function not implemented" (`ENOSYS`) or "Not supported": an operation Dolly
  does not have, such as `fork`, signals to process groups or network
  sockets; `docs/process-model.md` lists them. Another option of the same
  program rarely helps; another way of doing the task usually does.
- "Maximum call stack size exceeded" (Chrome) or "too much recursion"
  (Firefox), status 126: the browser's stack holds a few thousand nested
  calls, far fewer than a native one (`docs/browser-stack.md`); a deeply
  recursive program or test meets it first.
- Hiding stderr (`2>/dev/null`) or piping into `head` can hide the one line
  that says why; read it. A pipeline's status is its last stage's:
  `amy install NAME 2>&1 | tail -3` is 0 when amy fails, unless
  `set -o pipefail` came first.

## Rust and Go

`amy install cargo` brings Rust and Cargo (they need `dso@0`: `nena enable
dso` where the image lacks it); `amy install go` brings Go, whose `net/http`
goes through the page's broker. Cargo cannot read crates.io's index from the
browser (its cached files carry no CORS headers): `amy install vendor-crates`,
then `vendor-crates` in the project writes every crates.io crate it depends on
to `vendor/`, checked against the index's checksums, and the
`.cargo/config.toml` that points Cargo there, with the SDK's copy of `libc`
when a crate needs it; then `cargo build --offline`. With a `Cargo.lock` it
vendors the locked versions.

## JavaScript

`janis` is QuickJS with Node's module rules: `.mjs` files and code
using `import` are ES modules, other files and `-e` are CommonJS with
`require`. `fetch` and the `node:` built-ins work; worker threads do not exist.
`qjs` is the engine alone, without them. `amy install typescript` adds `tsc`. Without
npm, use dependency-free modules, for example from `https://cdn.jsdelivr.net/npm/`.
