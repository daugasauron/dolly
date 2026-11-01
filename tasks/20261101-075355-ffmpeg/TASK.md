# FFmpeg as an amy package, built inside Dolly

- STATUS: OPEN
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

## State (2026-11-01 21:10)

Integrator: agent C fixes (1) and (2) in `core/audit-slop` before 00:30; this branch merges
them, rebuilds the seed and images, and builds `ffmpeg`. Written and committed meanwhile:
`demos/ffmpeg/` (recipe, staging hook, README, browser test), the pin, upstream and licence
rows, the demo index and the `elsewhere` row of `test/amy-browser.mjs`.

- The test's commands and expected answers were checked natively with the host's FFmpeg 4.4.2:
  `mpeg4,320,240`/`aac`, `ffv1,320,240`/`flac`, `pcm_s16le,44100,1`, `2.000000`, equal MD5s of
  source and decoded FFV1 video and FLAC/WAV audio, MPEG-4 at `-q:v 3` 46 dB average PSNR
  against its source, the PNG `png,320,240` with its signature.
- The package's manual pages are each command's `-h`: FFmpeg's pages are Texinfo, which needs
  makeinfo and Perl (`--disable-doc`).
