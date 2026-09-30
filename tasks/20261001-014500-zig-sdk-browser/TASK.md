# Port the Zig SDK browser check to the core suite

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: tests,zig,core

The deleted browser harness ran `test/fixtures/zig-sdk.mjs` (removed in the
harness deletion; recover it with `git show core/host-modules~1:test/fixtures/zig-sdk.mjs`):
Zig programs and C interop built inside `ghostty-build`. `ghostty-build` has no
display, so a core Playwright test needs a small custom image that adds the
terminal display, as `demos/browser.mjs` `displayProbe` does for demos. The demo
port ran it that way and it passed in 13 s (with `printf` instead of `echo --`).

Done when: a `test/*-browser.mjs` runs the cases in Chromium and Firefox.

## Closed (2026-10-01)

It checks the host-built Zig SDK that `20260930-231000-self-host-zig` removes (the in-sandbox Zig emits C only). A check that the in-sandbox Zig compiles a Zig program and C interop moves to that task.
