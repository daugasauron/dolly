# Packages users can install: break out every useful library and tool, one consumer or not

- STATUS: OPEN
- PRIORITY: 220
- TAGS: packages,owner

The owner, 2026-11-18 morning, on `20261117-123021-packages-00`'s verdicts:

> Regarding not breaking out packages because there "is a single consumer", thats not an
> argument. I want users that try dolly to have as many useful packages to choose from as
> possible.

So the measure of a candidate is whether a user of Dolly would install it. How many of the
catalog's builds use it today does not count. Each candidate gets its own package with its own
build, a test or amy case, and a licence record, and the builds that compile it for themselves
`INSTALL` it.

## Reopened from packages-00

These are packages-00's verdicts given for one consumer, or for one example:
- ENet, from 0 A.D.;
- libmd and libXfont2, from xorg-server;
- utf8proc and Tree-sitter, from Neovim;
- libadwaita, from Ghostty;
- xxHash and OpenTelemetry's headers, from Mojo;
- OpenAL Soft's bundled {fmt}, against the `fmt` package;
- Blender's own libraries: OpenImageIO, OpenColorIO, OpenEXR, Imath, oneTBB, Eigen and the rest;
- Lua 5.5, from Slopyard;
- SDL2 with X11's video driver, from `imgui-x11`;
- Box3D with threads and SIMD, from Slopyard;
- libepoxy, from GTK and Blender;
- ggml, from llama.cpp and transcribe.cpp.

Other packages-00 verdicts stand where their reason is not the consumer count: a version a package
cannot share, or a build that patches its copies, decides those. Each such reason is to be read
again against the owner's measure.

## Done when

Every candidate above is a package that installs and passes its case in Chrome and Firefox, or
has a recorded reason that is not "one consumer".
