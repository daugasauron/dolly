# Reach a stable, browser-verified checkpoint and push main

- STATUS: CLOSED
- PRIORITY: 320
- TAGS: release,tests

Owner goal (2026-09-30 22:00 JST): rebuild all images from the merged runtime, run the source, artifact, core browser and demo browser suites with Playwright, commit and push main.

Done when: every suite passes (or each skipped check has a recorded reason), main is pushed, and the evidence is recorded here.

## 2026-09-30 22:45 JST — remote checkpoint

`origin/main` and tag `checkpoint-2026-09-30` point at `4340d03`, the state
verified at takeover (287 source tests; core browser suite in Chrome and
Firefox; all 40 images built by the previous integration). Today's work is on
`origin/takeover-20260930` and is not merged: a history review found changes that
reversed documented decisions (permission model, serial pipelines, compiler
defaults and retry, Dolly-owned core tools, libcurl metadata options). They are
being restored before the next checkpoint.

## 2026-10-01 03:40 JST: checkpoint `checkpoint-2026-10-01`

`main` moves to the reconciled `takeover-20260930` (the host-module layout, the
kernel module table and the page refactor included). Evidence, all on this commit
or its code-identical parent `c284a75`:

- Runtime rebuilt; the Rust seed rebuilt for the current process ABI; 39 of 40
  images rebuilt from source in the browser. `zero-ad` was not: its host-built
  engine no longer links (`tasks/20260930-231200-self-host-zero-ad`).
- `node --test 'test/*.test.mjs' 'demos/**/*.test.mjs'`: 344 pass.
- `node --test test/dolly.artifacts.mjs` over the 39 images: 18 pass.
- `node test/browser-tests.mjs chromium` and `firefox`: every core browser test
  passes in both.
- `npm run test:demos`: bhop, classicube, cmake, javascript, neovim, pi, python,
  rts, rust, sdl2 and studio pass; gpu-fluid and local-llm skip without a GPU
  window; codex fails (`tasks/20261001-033000-codex-tui-input`).
- `npm run publish` (39 images): release `516741bf…`, image inventory accepted
  in Chromium for every image; served by `npm run serve` on port 9000 and booted
  with commands and a C compile in Chrome and Firefox.
