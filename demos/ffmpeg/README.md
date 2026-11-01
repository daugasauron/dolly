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
- Files are the session's. A network URL fails: FFmpeg's protocols use IP
  sockets, which Dolly does not have
  ([process model](../../docs/process-model.md)), so `tcp:` and `udp:` fail
  with "Function not implemented" and `http:` with an I/O error.
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
It knows Clang by `cc -v`, and compresses its resources with the core
`gzip`. In Chrome, on a machine busy with other builds, the image built in
637 s on 2026-11-02 (configure 439 s, `make -j4` 184 s for 2,052 objects);
the package is 79 MB, `ffmpeg` and `ffprobe` 21 MB each.

[`ffmpeg-browser.mjs`](test/ffmpeg-browser.mjs) installs the package into
`default`, encodes lavfi's test pattern and tone into MP4, Matroska and WAV,
reads the streams back with `ffprobe`, decodes the lossless files to the
source's exact samples, compares the MPEG-4 video with its source (PSNR),
writes a frame as PNG and links a C program with the libraries.
