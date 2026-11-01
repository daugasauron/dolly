# FFmpeg

FFmpeg 9.0.2 from upstream's release archive, unchanged, configured by its
own `configure` under Slop and built by its Makefiles inside Dolly, as the
`ffmpeg` package: `amy install ffmpeg`.

## Images

- `ffmpeg`: FFmpeg: `ffmpeg` and `ffprobe` with FFmpeg's own codecs, formats and filters, and its libraries and headers for programs the `cc` package builds.

## Use

- Every decoder, encoder, format, filter and device FFmpeg builds without an
  external library, and zlib: MPEG-4 Part 2, FFV1, PNG, AAC, FLAC and PCM
  among them, in MP4, Matroska and WAV. Encoders that are external
  libraries (x264, x265, libvpx) are not.
- `-f lavfi` makes test input: `ffmpeg -f lavfi -i testsrc2 -f lavfi -i sine`.
- Files are the session's. A network URL fails with an I/O error (`tcp:`
  says it cannot resolve even `127.0.0.1`): FFmpeg's protocols use IP
  sockets, which Dolly does not have
  ([process model](../../docs/process-model.md)).
- The programs run threads, so an image that installs the package declares
  `threads@0`, as `default` does. A program linked with the libraries needs
  `-pthread`, `-lz` and `-lm` besides the `-lav*` it uses (`pkg-config`'s
  files are in `/usr/lib/pkgconfig`).

## Building

[`Dollyfile-ffmpeg`](Dollyfile-ffmpeg) runs upstream's `configure` in the
`system-tools` toolchain with zlib from amy. `configure` knows no Dolly and
is told `--target-os=none`, its OS without settings of its own, and
`--disable-asm`; the rest it probes, compiling and running its tests with
`cc`. The LGPL build, `--disable-autodetect`: nothing GPL-only is needed.
Two flags say what configure could not find out when the recipe was
written: `--optflags=-O3`, as Dolly's `cc -v` printed no Clang banner, by
which configure knows Clang, and `--disable-resource-compression`, as the
core `gzip` only decompressed; both have changed since (68824453). In Chrome the image builds in
under five minutes (configure 65 s, `make -j4` 196 s for 2,052 objects),
in at most 2.7 GB; the package is 79 MB, `ffmpeg` and `ffprobe` 21 MB each.

[`ffmpeg-browser.mjs`](test/ffmpeg-browser.mjs) installs the package into
`default`, encodes lavfi's test pattern and tone into MP4, Matroska and WAV,
reads the streams back with `ffprobe`, decodes the lossless files to the
source's exact samples, compares the MPEG-4 video with its source (PSNR),
writes a frame as PNG and links a C program with the libraries.
