# Build 0 A.D. completely inside the userspace

- STATUS: OPEN
- PRIORITY: 200
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
