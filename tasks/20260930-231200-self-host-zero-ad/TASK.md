# Build 0 A.D. completely inside the userspace

- STATUS: OPEN
- PRIORITY: 200
- TAGS: demo,zero-ad,bootstrap

Owner goal: the 0 A.D. engine, SpiderMonkey and its dependencies must be compiled inside Dolly instead of by demos/zero-ad/toolchain on the host.

Needs in-sandbox CPython (SpiderMonkey configure), rustc (SpiderMonkey Rust parts), the C/C++ compiler and Make/Ninja; depends on 20260930-231100-self-host-rust for a self-hosted rustc.

Done when: zero-ad images build from pinned sources with only in-sandbox tools and the host exception is removed.
