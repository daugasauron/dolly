# Reach a stable, browser-verified checkpoint and push main

- STATUS: OPEN
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
