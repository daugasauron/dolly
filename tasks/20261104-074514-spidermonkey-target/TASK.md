# SpiderMonkey builds without claiming __wasi__

- STATUS: OPEN
- PRIORITY: 90
- TAGS: port,0ad,investigation

`demos/zero-ad/Dollyfile-spidermonkey:52-56` exports `CC='cc -D__wasi__'` and configures
`--host=wasm64-unknown-wasi --target=wasm64-unknown-wasi`, because mozbuild knows no Dolly (the
compiler's own target is `wasm64-unknown-dolly`). That is a detection claim of the kind the porting
rules forbid for Linux and AMD64: SpiderMonkey compiles its WASI paths (a wasi-libc without
threads) on a musl libc with threads. zero-ad-engine's `spidermonkey-check` passes today, so nothing
is known to break (`tasks/20261102-133232-recipes-apps`, F11).

Decided 2026-11-04 (`tasks/20261102-133353-owner-decisions`): the claim goes; what it selects is
measured first. Step 1: list every `__wasi__` conditional the build compiles (`js/src`, `mfbt`,
`mozglue`, `memory`, `build`, `python/mozbuild` of the pinned source) and classify each: true for
Dolly too (a Wasm target without JIT or signals), false for Dolly (threads, libc details, the
filesystem), or build-system only (target tables, configure checks). Step 2, from that table, the
smallest honest build: a `dolly` OS in mozbuild's target tables and `js/moz.configure`, with the
branches the table marks true selected by what they test rather than by `__wasi__` where a
feature test exists, and nothing speculative; carried as the demo's source patch
(`demos/zero-ad/prepare-sources.sh`) and recorded in its README. No report upstream.

Done when: the table is in this task; the recipe sets no `-D__wasi__` and names the real target;
`spidermonkey-check` prints "wasm64 realms, GC, callbacks and clone passed" and
`demos/zero-ad/test/0ad-spidermonkey-browser.mjs` passes in Chromium and Firefox; zero-ad-engine
builds in a round. If the table shows every selected branch is true for Dolly and the patch would
be a table entry alone, that entry is still made: the target's name is the claim.
