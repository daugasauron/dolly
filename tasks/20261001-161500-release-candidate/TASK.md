# Release candidate from `next` for local review

- STATUS: CLOSED
- PRIORITY: 340
- TAGS: release,review

Owner (2026-10-01): build a stable release candidate and run it locally for
review; no remote deployment. The current local release stays the afternoon
checkpoint (`checkpoint-2026-10-01-pm`, release `35b11b69…`) until the candidate
passes every suite.

## What the candidate adds over the checkpoint

- Dollyfiles name every resource by full URL (`DOLLY 5`); the site is plain
  static files at repository paths; sessions are `/session/?name=NAME`.
- Core: runtime-owned terminal mailbox; per-module ABI digests (`process.h` is
  the core ABI only); Ctrl+C follows termios ISIG; `alarm`/`setitimer` raise
  SIGALRM; one `posix_spawn`; Slop is built by recipe (`COMPILEC`) and the seed
  compiles only the Dollyfile engine; `cc` defaults to `gnu17`/`gnu++17`.
- Builds: Make `-j`, Patti `-j 4`, parallel catalog builds, chunked snapshot
  upload; Rust executables are threaded (`threads@0`); stock pip over the HTTP
  broker replaces Bonnie; an in-Dolly LLVM TableGen image (`llvm-tablegen`).
- Fixes from the Fable review: no double-Ctrl+C force exit of the shell,
  reproducible compiler scratch names, normalized recipe URLs.

## Known issues

- Threaded Codex reaches sign-in ~2 s later in most runs
  (`20260930-230009-rust-threads`).
- Firefox terminal test flake (`20261001-095000-terminal-text-flake`).

## Review

- Candidate: `http://127.0.0.1:9001/` (release `d1459402…`, served by
  `DOLLY_PORT=9001 node scripts/serve.mjs` in `work/next-build`, tag
  `rc-2026-10-01`). The afternoon checkpoint stays on `http://127.0.0.1:9000/`.

## Done when

- Full catalog (with zero-ad relinked) built from `next`; source, artifact,
  core browser (Chrome, Firefox) and demo suites pass; published locally.

## Built and verified (2026-10-01, 17:31)

- Catalog: 42 images from `next` with the parallel scheduler (41 in 48 min,
  then Studio after a staging fix; zero-ad relinked against the new process ABI
  and imported).
- Source 341/341, artifacts 25/25, core browser suites all pass in Chrome and
  Firefox, all 12 demo tests pass (Chrome), and the publish browser-checked all
  42 images. `default`, Codex and Python boot from :9001.

## Approved and deployed (2026-10-01)

The owner reviewed the candidate and asked to push and deploy. `main` moved to
the candidate (`5574fb8`, then the Pages fixes `f35c0d9`, `bbcb089`: the seed
now ships as verified parts because it exceeds Cloudflare's 25 MiB file limit
after Brotli). daugasauron.com serves release `38b08a88…` (Cloudflare
deployment `e46311f0`); `default`, Codex and Python boot from it in headless
Chrome. GitHub Pages: release `pages-bbcb089-r1` (artifact SHA-256
`b9be67c0…`) and workflow run 36869300866.
