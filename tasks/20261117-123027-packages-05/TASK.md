# Three versions of {fmt}: 0 A.D.'s package (7.1.3), Blender's build (12.1.0), Mojo's build (11.2.0)

- STATUS: OPEN
- PRIORITY: 100
- TAGS: packages,audit,0.1.9

## State (2026-11-17)

Done on `ws/packages`: the `fmt` package moved to `demos/tools` at 12.1.0 (Blender's pin, a pin
of its own, `DOLLY_FMT_*`; it was staged from 0 A.D.'s build sources). `blender-deps`,
`zero-ad-deps` and `mojo` install it; Mojo's compiler links `libfmt.a` instead of compiling
`format.cc` from its own staged copy (`bazel-to-cmake.py`), and `DOLLY_MOJO_FMT` is gone.

0 A.D. and Mojo are heavy chains this tree does not build: the next round builds `zero-ad-deps`,
`zero-ad-engine`, `zero-ad`, `mojo`, `mojo-gpu` and `deep-hedger` on {fmt} 12.1.0. Measured
here: 0 A.D.'s uses (`fmt::sprintf` of `CStr`, a `std::string` subclass, `%d`/`%lld`/`%04x`/`%.1f`,
a null `%s`, `fmt::format` and `format_to_n` with literal format strings, nothing wide) compile and
print the same against fmt 12.1.0's headers with the host's g++ (`work/packages-evidence-1117/fmt-probe.cpp`); every
API Mojo names (`format_string`, `vformat`, `format_to(_n)`, `dynamic_format_arg_store`,
`gmtime`) is in 12.1.0.

Tested: its amy case (`demos/tools/test/amy-cases.json`, run alone with the other new packages' cases) passed in Chromium and Firefox (`work/packages-evidence-1117/runs/test-amy-new.log`).

Built in `work/packages`: `fmt` 12.1.0 (923,458 bytes).

Mojo's staged `mojo/mojo.tar.gz` no longer holds {fmt}: its `SOURCE` pin is refreshed when the next round stages Mojo (this tree does not stage it).

Built in `work/packages`: `blender-deps` over the packages (460,838,815 bytes, 873 s): OpenColorIO found expat 2.8.5, OpenImageIO {fmt} 12.1.0, TIFF 4.7.2 and JPEG 62 (FindJPEG's `libjpeg.a`, as when the stage built libjpeg-turbo: OpenImageIO takes libjpeg-turbo's CMake config only for its shared `libjpeg-turbo::jpeg`), and the stage's embedded interpreter links and runs.

## Candidate

- Who installs it: Blender (OpenImageIO), 0 A.D., Mojo; sessions.
- What the consumers lose: Blender's CMake build of it, Mojo's staging and compile of `format.cc`.
- Its own build: upstream's CMake, static.
- Verdict: done, if the next round's 0 A.D. and Mojo builds pass. OpenAL Soft's bundled 11.1.1 is
  part of its release and stays.
