# Build 0 A.D. completely inside the userspace

- STATUS: OPEN
- PRIORITY: 270
- TAGS: demo,zero-ad,bootstrap

Owner goal: the 0 A.D. engine, SpiderMonkey and its dependencies must be compiled inside Dolly instead of by demos/zero-ad/toolchain on the host.

Needs in-sandbox CPython (SpiderMonkey configure), rustc (SpiderMonkey Rust parts), the C/C++ compiler and Make/Ninja; depends on 20260930-231100-self-host-rust for a self-hosted rustc.

Done when: zero-ad images build from pinned sources with only in-sandbox tools and the host exception is removed.

## 2026-10-01: the host-built engine no longer links

The 2026-10-01 checkpoint rebuilt 39 of 40 images; `zero-ad` failed with "wrong
dolly.process stamp": its engine is linked outside Dolly against the process
ABI of 2026-09-30. Relinking (`DOLLY_PROCESS_SYSROOT=.cache/process-sysroot-KEY
bash demos/zero-ad/toolchain/link-engine.sh`) now needs the Emscripten port
libraries again, and `dependencies.sh` fails at CMake configure
(`.cache/0ad/dependencies.log`); the link also needs `-ldolly-http` for its
`libcurl`. Building the engine inside Dolly removes this whole host path.

Relinked on `rebuild-batch` (process sysroot `1d4fab67…`): the link now takes
the host module clients (`-ldolly-runtime -ldolly-http -ldolly-display
-ldolly-gpu -ldolly-audio`) from the process sysroot instead of the stale
`libdollygpu`/`libdollyaudio`, and `libcurl.a` is rebuilt from the current
`src/libcurl-fetch.c`; `dependencies.sh` was not needed. The `zero-ad` image
(snapshot `25b3f8f5…` for image inputs `74246d78…`) passes
`0ad-engine-browser.mjs` and `0ad-graphics-browser.mjs zero-ad hardware`.

- Released in the local checkpoint `35b11b69…` (2026-10-01, 15:21). The engine
  is still host-built; building it inside Dolly remains this task.

Relinked again on `next` for the process ABI of 892c163 (per-module packets
and `dolly.host` ABI digests; process sysroot `ef304c4d…`), with `libcurl.a`
rebuilt against those headers: engine `9bf417de…` declares `http`, `display`,
`gpu` and `audio` with digests. The `zero-ad` image (snapshot `56cb41bd…` for
image inputs `fda71d69…`) passes `0ad-engine-browser.mjs` and
`0ad-graphics-browser.mjs zero-ad hardware`. In a worktree, `link-engine.sh`
needs real copies of its `.cache/0ad` inputs: the container mounts only the
worktree, so symlinks into the root checkout do not resolve.
