# RTS arena handover

Status checked 2026-09-09 in `/home/daug/dev/dolly`.
Read [AGENTS.md](../AGENTS.md) first; [rts-arena.md](rts-arena.md) is the usage guide.
This handover is separate from the general [audit backlog](audit-handoff.md).

## Review gate and working tree

- Branch: `rts-arena`, HEAD `abab3cf`. The RTS work is **uncommitted**, including
  new source files, tests, the Codex relay and `src/rts/demo.tar.gz`.
  Use `git status --short` for the complete inventory; preserve these changes.
- The user explicitly requires reviewing the finished image **before any merge
  into main**. Approval has not been given. No merge, push or public deployment
  was performed in this work. The persistent goal is blocked on that review.
- Latest feedback requested real fuzzy search for both providers and models;
  that change is implemented and locally published, but still awaiting review.
- Ignore `.pi`. Other worktrees exist, notably
  `/home/daug/dolly-audits/runtime-integration-20260909`; do not modify them or
  stop their processes. Recheck `git worktree list` before later integration.

## What works

- The image boots an in-sandbox launcher: offline demo, new match, OpenRouter
  key setup, local Codex relay import, or Slop. Command-line match/replay entry
  points remain available. Escape from a game returns to its caller.
- Provider/model selection now uses Pi's `fuzzyFilter`, `Input`, `SelectList`
  and `TuiAltScreen`, entirely under Janis/Wasm. Filtering is immediate; arrows
  navigate, Enter selects, Escape backs out. Only vision models are offered,
  with reasoning and price information. Example search: `gem fla`.
- OpenRouter keys use Pi's existing in-sandbox credential store. Relay import
  adds only `codex-local`, preserves other providers, publishes configuration
  by rename and removes its temporary directory. Starting paid calls requires
  confirmation. Catalog refresh can fall back to Pi's cache.
- Two native Seven Kingdoms engines and two Pi RPC sessions retain separate
  player views and histories. Tools use player-local 800×600 pixel coordinates,
  including move-only input and sequential action batches. Do not add strategy
  guidance or scripted openings: the agents must discover the game themselves.
- **Continuous animation is essential.** Engines run independently of model
  decisions; the viewer redraw cadence is 33 ms, not a guaranteed measured FPS.
  The live regression checks frame advancement during a four-second provider
  response delay. HTTP requests remain serialized; this is not a fair latency
  benchmark, and changing the browser contract to improve it is out of scope.
- Replay uses two native recordings plus recorded UI inputs and thinking/tool
  events, not a slideshow. Space pauses, +/- changes speed, Escape exits; EOF
  holds the final frame. Playback starts no Pi processes or model requests.

## Source map

| Area | Files |
| --- | --- |
| Recipe, startup, retained demo | `Dollyfile-rts-arena`, `modules/rts-arena.dm`, `scripts/prepare-image-sources.sh`, `index.html` |
| Launcher and fuzzy UI | `src/rts/spectator/launcher.mjs`, `picker.mjs` |
| Live supervision, replay, trace rendering | `src/rts/spectator/main.mjs`, `replay.mjs`, `trace.mjs`, `viewer.cpp` |
| Agent observations and input protocol | `src/rts/player.js`, `PLAYER.md`, `input.cpp`, `input.h` |
| Native multiplayer/replay port | `src/rts/arena.cpp`, `arena.h`, `config/seven-kingdoms-dolly.patch`, `modules/seven-kingdoms.dm`, `Dollyfile-rts-build` |
| Local subscription service | `scripts/codex-relay.mjs`, `test/codex-relay.test.mjs`, `docs/browser-boundary.md` |
| Browser and unit proofs | `scripts/browser-harness.mjs`, `test/fixtures/rts-*`, `test/rts-*.test.mjs`, `test/browser-startup.test.mjs` |

Native replay changes preserve each player's fog/camera/selection without
reissuing simulation commands. Guards prevent blocking lifecycle/help dialogs;
EOF bypasses frame-publication throttling so both panes show the actual final
frame. Preserve these distinctions when editing the upstream patch.

## Included recording

`src/rts/demo.tar.gz` is the durable, 872,306-byte replay-only asset. It is packed
into the module source archive and extracted inside Dolly to
`/usr/share/dolly/rts/rts-high-vs-xhigh`.

SHA256: `9636284d504b30035460301b27e548fa3bc06bd83af0fa54e4de7988c57e5a97`.

Astra high is player 1; Astra xhigh is player 2. Player 2 won at frame 27741.
The archive contains native `7KRP` recordings, input logs, manifest/result and
exposed thinking/tool traces, not credentials or full screenshot histories.
Full originals remain in ignored `build/rts-high-vs-xhigh/`; do not rely on that
directory for reproducible builds. Include the new source asset when committing.
Uploading a `.tar.gz` as `match.rpl` does not extract it. Use
`gzip -dc /workspace/match.tar.gz | tar -xf - -C /workspace` for external bundles.

## Running locally

- Review URL: <http://localhost:9001/rts-arena/> (HTTP 200 when checked).
- Server PID was `565034`: `node scripts/serve.mjs build/rts-releases`.
  `current` points to release
  `deb9d9f90a63cc992df94fab951b52e8b270d73483d58664fec18c676c06a010`.
  Existing tabs keep their loaded image; use a fresh tab for updates.
- Normal `build/releases/current` is untouched. The latest RTS Pages artifact
  is `build/rts-pages.tar.gz` (278 MiB), SHA256
  `80b81a193e00513053736a359ba2cd0b2838cb353f91ebcb416242bb846dd6a3`.
- A relay is **already listening on 9002** (PID `1080029` when checked), allowing
  `http://localhost:9001` and test origin `http://127.0.0.1:9011`. Starting another
  caused the user's `EADDRINUSE`. Its private upload configuration exists at
  `/tmp/dolly-codex-relay-21Nay6/models.json`; do not print or commit its contents.
  Revalidate PIDs before taking any action. Relay restart invalidates the old
  capability; import the newly generated file. Native login expiry still needs
  a host-side Codex login refresh; current authentication was not revalidated.
- The relay is a separate, optional loopback inference service, not a browser
  host fallback. Native OAuth tokens stay outside Dolly; the sandbox receives
  a relay capability. Do not upload `~/.codex/auth.json`. No browser ABI/import
  changes were made for this work; `dolly_http_dispatch` remains the network edge.

## Verification and remaining issues

Latest fuzzy-picker checkpoint:

- `build/rts-fuzzy-tests-final.log`: all **298 tests pass**.
- `build/rts-fuzzy-localhost.log`: real Chrome against the exact published URL;
  offline demo, relay import, live fuzzy search, actual arrow selection changes,
  Enter/Escape, vision filtering, hidden key entry and shell recovery pass.
- `build/rts-fuzzy-package.log`: all eight selected image inventories pass.
  `build/rts-launcher-fuzzy-openrouter.png` shows the new UI.
- Before the fuzzy-only change, `build/rts-launcher-replay-localhost.log` proved
  both complete native replays and displayed frames reached 27741, final traces
  matched, recordings stayed unchanged, no HTTP occurred, and cancellation
  preserved the shell. `build/rts-launcher-live-recheck.log` passed the full live
  game/Pi regression using a scripted provider. Recent UI tests made no paid calls.

**Not fixed:** `build/rts-launcher-live-final.log` records an intermittent
`mouse menu/quit must not stall either player` timeout during concurrent
packaging. An isolated rerun passed. The cause is unconfirmed; do not call it
resolved or simply increase timeouts. `test/fixtures/rts-match.mjs` now includes
before/after frame/time diagnostics on failure. Capture those on recurrence.

Also unresolved: an earlier match export omitted files during directory
enumeration. Explicit required filenames, independent replay downloads and a
regression test now protect the exports; the enumeration root cause is not
isolated. Forced cancellation preserves the kernel/filesystem but cannot promise
final replay capture or scratch cleanup. The process-call packet limit remains
1 MiB versus the HTTP broker's 8 MiB; image-history trimming is not a general fix.

## Resume commands

```sh
npm run image -- rts-arena
node --test test/*.test.mjs
DOLLY_BUILD_IMAGES=rts-arena DOLLY_IMAGE=rts-arena DOLLY_BROWSER_MODE=rts-launcher ./scripts/test-browser.sh
DOLLY_BUILD_IMAGES=rts-arena DOLLY_IMAGE=rts-arena DOLLY_BROWSER_MODE=rts ./scripts/test-browser.sh
DOLLY_BUILD_IMAGES=rts-arena DOLLY_IMAGE=rts-arena DOLLY_BROWSER_MODE=rts-split-replay ./scripts/test-browser.sh
DOLLY_BUILD_IMAGES=rts-arena ./scripts/package-pages.sh build/rts-pages.tar.gz build/rts-releases
```

`rts-split-replay` defaults to the baked recording; `DOLLY_RTS_REPLAY_BUNDLE`
selects an uploaded bundle. Add `DOLLY_BROWSER_PAGE=http://localhost:9001/` to
check the served release. `rts-live` is different: it makes real provider calls.

The image command updates pins and reuses the kernel/compiler seed; the last
UI rebuild took 21.7 s. Keep all source files frozen during packaging: release
acceptance checks the complete checkout and correctly rejects mid-run edits.
This handover was added after publication; the running application is unchanged,
but its recorded source manifest naturally predates this document.

Next: get user review, investigate the intermittent liveness failure, then stage
the related modified **and untracked** files and integrate only with explicit
merge approval. Recheck other worktrees/main, regenerate pins and repeat browser
acceptance after integration. Do not silently omit the demo or relay from the
checkpoint, commit secrets/test histories, or broaden the browser boundary.
