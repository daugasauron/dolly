# FFmpeg as an amy package, built inside Dolly

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: packages,demo,ffmpeg

Owner (2026-11-01): "I feel ffmpeg should be added?"

FFmpeg's newest stable release as the package `ffmpeg` (`amy install ffmpeg`): `ffmpeg`,
`ffprobe`, and `libavcodec`, `libavformat`, `libavutil`, `libswscale`, `libswresample`,
`libavfilter` with their headers for recipes that `INSTALL` it. Built inside Dolly from
upstream's release archive, unchanged, by upstream's `configure` and Makefiles.

## Done-when

- The package builds inside Dolly; `demos/ffmpeg/test/ffmpeg-browser.mjs` installs it on
  `default` in Chromium and Firefox: `lavfi` test pattern and tone encoded natively (MPEG-4
  Part 2 or FFV1, FLAC or PCM; MP4, MKV, WAV), `ffprobe` reads the streams back, a decode
  round-trip checks the output, a frame is written as PNG.
- Pins, upstream and licence rows, `demos/ffmpeg/README.md`, its row in `test/amy-browser.mjs`.
- Build time and peak memory measured.

## Source

- FFmpeg 9.0.2, `https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.gz`, SHA-256
  `84960df915059e8754fef2cd7c9afeb614062b1b5458ec471eecee619ee04e98` (18.1 MB), newest on
  ffmpeg.org/releases on 2026-11-01. Its `.asc` verifies with the FFmpeg release signing key
  (`FCF9 86EA 15E6 E293 A564 4F10 B432 2F04 D676 58D8`, from ffmpeg.org/ffmpeg-devel.asc).
- The archive holds 10,399 regular files and 126 directories, no links, no pax header, longest
  path 83 bytes: Dolly's `tar` reads it as published.
- Licence: the default build, LGPL 2.1 or later. Nothing needed is GPL-only (no x264, x265,
  postproc or GPL filters): the encoders and formats the demo uses are FFmpeg's own.

## Configure line (chosen)

`configure --prefix=/usr --target-os=none --arch=wasm --disable-asm --disable-doc
--disable-autodetect --enable-zlib --disable-debug`, with `cc`/`ar` from the `cc` package and
zlib from amy.

- `--target-os`: without it configure takes `uname -s` (`dolly`) and dies "Unknown OS 'dolly'".
  `none` is upstream's OS with no OS-specific settings, so every feature comes from its
  probes; nothing claims Linux.
- `--arch=wasm` is what `uname -m` (`wasm64`) gives anyway; `--disable-asm` leaves the
  `simd128` code out.
- `--disable-autodetect`: no external library is searched for; zlib is asked for.

## Blocker: Slop cannot run FFmpeg's configure (finding for Slop, agent C)

Measured natively (`src/slop.c` with `test/fixtures/native-spawn.c`, as
`test/slop.test.mjs` builds it, host tools and gcc), against Bash 5 on the same tree.

1. **`for opt do` is refused** (configure line 4682, the option loop): `slop: for word list
   requires a separator before do`, status 2, before any check. `for NAME do` (no `in`, no
   separator) is POSIX (XCU 2.10.2, `For name do_group`). Reproduce:
   `slop -c 'set -- a b; for x do echo $x; done'`. Bash, dash print `a b`.
2. **Every variable lives in `environ`, so a substitution costs O(variables²)**
   (`shell_state_capture`/`shell_state_restore` copy every entry and re-`setenv` each, and
   `setenv` scans `environ`). FFmpeg's configure holds 4,323 variables when it logs `set`
   and more later (each component's `_deps`, `_select`, `yes`). Measured, 100 `x=$(:)` after
   N assignments, native Slop: N=1,000 0.37 s, 3,000 2.96 s, 10,000 32.2 s (0.32 s each);
   Bash with 10,000: 0.09 s in all. N assignments alone: 10,000 take 0.58 s.
   With line 4682 changed to `for opt in "$@"; do` in a scratch copy, Slop reached the 343rd
   check in 90 s natively (88 % of a core in Slop itself); Bash runs all 733 checks in 5.8 s.
   The whole run, with that one line changed: **551 s natively under Slop** (99 MB peak)
   against 5.8 s under Bash, and every file it writes is the same (`config.h`,
   `config_components.h`, `ffbuild/config.mak`, `ffbuild/config.sh`, `libavutil/avconfig.h`,
   the component lists) as is its output. So (1) blocks and (2) is the cost; no other shell
   difference showed.
3. Programs that are builtins elsewhere: in its first 126 checks Slop spawned `[` 980,
   `echo` 737, `test` 379, `printf` 283 times (strace), as the configure survey found
   (`tasks/20261006-121403-configure-survey`).

`chmod +x $TMPE` and `chmod +x $TMPSH`, then running `$TMPSH` (a `#!/bin/sh` script; "Sanity
test failed" otherwise): neither side is wrong. Dolly has no `chmod` (no permission bits, the
owner's decision), so the two lines print "not found" into the log and configure ignores their
status; Dolly's spawn ignores execute bits and runs a `#!` line's absolute in-Wasm interpreter
(`docs/process-model.md`), so the script runs and the sanity test passes. To confirm in the
build's log.

## Finding: `cc -v` without input is not Clang's banner

FFmpeg's configure (`probe_cc`) names Clang by `$cc -v 2>&1 | grep -q clang`, as autoconf's
version log and Meson read `-v` too. Dolly's `cc -v` alone prints `cc: no input files` and ends
with 64 (`src/compiler.cpp`, `options.inputs.empty()`), so configure warns "Unknown C compiler
cc, unable to select optimal CFLAGS" and gives it no optimization, dependency or Clang flags:
the build would be `-O0`. The recipe says `--optflags=-O3` (configure's own option for that)
and the comment says why. Proposal (compiler driver, a seed and compiler round): with `-v` and
no input, print Clang's banner on stderr and end with 0, as Clang does:
`clang version 24.0.0`, `Target: wasm64-unknown-dolly`, `Thread model: posix`. Then the recipe
drops `--optflags` and configure picks Clang's `-O3` and `-MMD` itself. Filed as
`tasks/20261101-130245-cc-version-banner`.

## Finding: the core gzip is taken for a compressor

FFmpeg's configure enables resource compression when `[ -x "$(command -v gzip)" ]`, and its
Makefile then runs `gzip -nc9` on `fftools/resources/graph.html`. The `gzip` package (USE'd here
to unpack the archive) only decompresses, by design (`docs/slop.md`, `fd44230c`), so the first
build stopped after 1,059 compiles: `gzip: -n is unsupported: this gzip only decompresses`,
`common.mak:171: fftools/resources/graph.html.gz] Error 2`. The recipe says
`--disable-resource-compression`, upstream's option ("don't compress resources even when
possible"); the resources are then embedded as they are. Proposal (core package, owner's
call): the core `gzip` compresses as well, with the zlib it already links (`deflateInit2`
with a gzip wrapper writes no name or time, which is `-n`), so a command named gzip does what
upstream build scripts take that name to do.

## State (2026-11-01 22:05): the package builds inside Dolly

C's Slop (`core/audit-slop` `ad78dbef`: `for NAME do`, `test`/`[`/`echo` run in the shell, a
subshell undoes only what it changed) is merged here (`2a0afc9f`); the seed was rebuilt (image
inputs `sha256:45d43ca5…`) and the images `ffmpeg` needs that C's tree had built from the same
recipes and seed were hard-linked from `work/audit-slop/dist` (system-build, core, zlib, gzip,
curl, git, zig-build, ghostty-build, display, system-tools, mandoc, posix, amy, nena, transfer,
default, cc: same recipe hash and build ID, so the plan reuses them).

`ffmpeg` built in Chrome (`slot.sh bigbuild`, one job), 2026-11-01 21:52, `0209a103`:

| Step | Time |
| --- | --- |
| configure (Slop) | 64.6 s (102 s in the first run, beside other builds) |
| `make -j4`: 2,052 compiles, 7 archives, 2 programs | 196 s |
| whole image (restore, unpack, configure, make, install, checks, seal) | 281 s |

- Memory: the scope's cgroup peak 2.68 GB (page cache included), sampled anonymous at most
  1.48 GB. It needs no `bigbuild`; a 6 GB build slot holds it.
- Snapshot 79 MB in 10 packs, 222 files: `ffmpeg` 20.3 MiB, `ffprobe` 20.1 MiB,
  `libavcodec.a` 21.6 MiB, `libavfilter.a` 4.5, `libavformat.a` 3.9, `libavutil.a` 1.9,
  `libswscale.a` 1.3, `libswresample.a` 0.1; host modules `runtime@0`, `threads@0`.
- Configure under Slop printed `slop: chmod: command not found` once (the other `chmod` goes to
  its log) and passed its sanity test: the `#!/bin/sh` script ran without modes, as above.
  It detects `pthreads`, network support (sockets refused at run time), the `lavfi` input
  device only (no `fbdev`, `oss`, `v4l2` headers here), and warns "Unknown C compiler cc" and
  "pkg-config not found" (nothing is looked up with it).
- In the build: lavfi's test pattern and tone encoded to MPEG-4 and FLAC in Matroska, and
  `ffprobe` names both streams.
- `wasm-ld: warning: unknown -z value: noexecstack`, twice: configure's `check_ldflags` keeps
  `-Wl,-z,noexecstack` because the linker only warns. Harmless; not changed.

## The demo test (2026-11-01 22:00)

`demos/ffmpeg/test/ffmpeg-browser.mjs` passes in Chromium (5.4 s) and Firefox (7.1 s), each run
whole, on `default` with this branch's images: `amy install ffmpeg` (zlib first, 197 files,
79 MB), lavfi's pattern and tone into MP4 (MPEG-4 Part 2, AAC), Matroska (FFV1, FLAC) and WAV
(PCM), `ffprobe` reads every stream back, the FFV1 video and the FLAC/WAV audio decode to the
MD5 of lavfi's own output, the MPEG-4 video is compared with its source (above 30 dB), a frame
is written as PNG and probed, and after `amy install cc` a C program including the three main
headers links `-lavformat -lavcodec -lavutil -lswresample` and runs.

Measured in Chromium besides the test (`build/ffmpeg-evidence/evidence-chromium.log`):
`amy install ffmpeg` 0.96 s from the local server, `ffmpeg -version` 90 ms, two seconds of
320x240 to MP4 255 ms, four seconds of 640x480 MPEG-4 at `-threads 4` 226 ms; PSNR of the
MPEG-4 clip 46.0 dB (the host's FFmpeg 4.4.2 gives 46 too); 177 encoders, 502 decoders.
A network URL: `ffprobe http://127.0.0.1:9/clip.mp4` and `tcp://127.0.0.1:9` end with 1, "I/O
error", the second after "Failed to resolve hostname 127.0.0.1: Non-recoverable error": libc's
`getaddrinfo` answers `EAI_FAIL` for a numeric address, where POSIX parses it without a lookup
and the refusal would come from `socket` (`EAFNOSUPPORT`). Explicit either way; for the kernel
and libc audit (B), not changed here.
Not run: `test/amy-browser.mjs` (it asserts that every package of the catalog is used, and this
tree's catalog is narrowed); its row for `ffmpeg` is the `elsewhere` entry.

## Where FFmpeg would serve in Dolly (the owner's question)

- Today nothing in the catalog decodes or encodes media with FFmpeg's breadth; each user
  carries a small decoder of its own: `sdl2-mixer` (stb_vorbis, minimp3, dr_flac), Xonotic and
  0 A.D. (libogg and libvorbis packages), the PNG writers of ClassiCube, the RTS and raylib for
  the agents' screenshots (ClassiCube's and the RTS's sound are off), the speech demo's 48 to 16 kHz resampler
  (`demos/speech/hearing.h`).
- None should switch: each decoder is one file or one small library sized to its use, and a
  static FFmpeg is tens of MB per program and needs `threads@0`. The SDL2 games play through
  SDL_mixer, which upstream builds on exactly those single-file decoders.
- Where it adds something nobody has: sessions and agents that handle media files (inspect
  with `ffprobe`, convert, cut, extract frames or sound), bhop's recorded attempts (PNG frames
  plus `inputs.jsonl`, `demos/bhop/agent/replay.mjs`) turned into one video file inside Dolly,
  and recipes that need libavcodec or libavformat (a media player on `display@0`/`audio@0`,
  or a game engine whose upstream video path uses FFmpeg). Those are new work, not switches.

## Closed (2026-11-01 22:15)

Every done-when item holds on `demo/ffmpeg` (`724e4177`), with `core/audit-slop` merged: the
package builds inside Dolly, the demo test passes in Chromium and Firefox, the pins, upstream,
licence and `test/amy-browser.mjs` rows and the README are in. The package needs C's Slop
(`ad78dbef`) in the same round. Open elsewhere: the `cc -v` banner
(`tasks/20261101-130245-cc-version-banner`) and, the owner's call, a core `gzip` that
compresses (above).

## Lessons

- The first wall was the shell, and it was measured natively in minutes: Slop with
  `test/fixtures/native-spawn.c` ran the 9,000-line configure against Bash on the host, which
  separated the one parse error (`for opt do`) from the cost (variables in `environ`, 551 s
  against 5.8 s) before any image was built. Inside Dolly configure then took 65 s.
- Each later stop was an upstream probe reading a Dolly answer literally: `uname -s` (unknown
  OS), `cc -v` (no banner, so `-O0`), `command -v gzip` (a decompressor taken for a
  compressor). Upstream's own options (`--target-os=none`, `--optflags`,
  `--disable-resource-compression`) said what the probes could not, without a patch; the
  causes are in Dolly and filed.
- Reusing another tree's built images by hard link, when recipe hash and build ID are equal,
  turned a seed change into a 5-minute package build instead of rebuilding the chain behind
  `default` (Zig, Ghostty); `npm run image --plan` confirms the reuse before anything runs.

