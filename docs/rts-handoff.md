# RTS arena handover

Integration checked 2026-09-10. Read the checkout's `AGENTS.md`, the
[usage guide](rts-arena.md) and [audit backlog](audit-handoff.md).

## Integration

The user's merge instruction superseded the earlier review gate. Commit
`0eaa549` preserves all 37 modified and untracked handover files on top of
`rts-arena` commit `abab3cf`, including the launcher, fuzzy picker, replay,
Codex relay and demo. Merge `2e6ca3d` combines that checkpoint with the Rust,
Patti, ripgrep, fd and Codex work in the private integration checkout.
The combined catalog has 30 images, with compact rows and build images last.

The integration checkout is
`/home/daug/dolly-audits/runtime-integration-20260909`. Main is updated only after
combined browser acceptance and the deployment export pass. The served release
records its exact source in `build/releases/current/release/source.commit` and
its image acceptance in `release/acceptance.txt`. The detailed build/test journal
is the checkout's ignored `work/runtime-integration/rts-integration-task.md`.
Do not modify `/home/daug/dev/dolly` or stop that checkout's services.

## Runtime distinctions to preserve

- The launcher, fuzzy provider/model picker and credential configuration run
  entirely inside Dolly. Loading the image or watching its included replay
  makes no paid calls. Live matches require confirmation.
- Two native Seven Kingdoms engines and two Pi RPC sessions have separate
  player views and histories. Tools use each player's 800×600 pixels. No
  supplied strategy, scripted opening or model-decision barrier is present.
- Engines animate independently of model responses. The viewer's 33 ms redraw
  cadence is not a guaranteed measured frame rate. The later [HTTP pool](http.md)
  removes the serial request limit present at this integration checkpoint.
- Replay uses both native recordings and logged UI input, plus recorded exposed
  thinking/tool events. UI replay never reissues simulation commands. No Pi
  processes or model requests run during playback. EOF holds the actual final
  frame; lifecycle/help guards prevent blocking the unattended engines.
- Normal shutdown saves recordings. Forced Worker cancellation preserves the
  kernel/filesystem but may miss final replay capture or scratch cleanup.

The input integration fixes an intermittent missed click: advancing input from
nested event polls could move the pointer before a widget consumed its release.
Agent input now advances once per UI update. A real browser reproduction failed
on repetition 15 before the change; the canonical source-built image passed all
20 repetitions and the full multiplayer/Pi/replay checks afterward.

## Source map

| Area | Files |
| --- | --- |
| Recipes and startup | `Dollyfile-rts-arena`, `modules/rts-arena.dm`, `scripts/prepare-image-sources.sh`, `index.html` |
| Launcher and fuzzy UI | `src/rts/spectator/launcher.mjs`, `picker.mjs` |
| Supervision, replay and traces | `src/rts/spectator/main.mjs`, `replay.mjs`, `trace.mjs`, `viewer.cpp` |
| Player input | `src/rts/player.js`, `PLAYER.md`, `input.cpp`, `input.h` |
| Native port | `src/rts/arena.cpp`, `arena.h`, `config/seven-kingdoms-dolly.patch`, `Dollyfile-rts-build` |
| Optional relay | `scripts/codex-relay.mjs`, `test/codex-relay.test.mjs`, `docs/browser-boundary.md` |
| Browser regressions | `scripts/browser-harness.mjs`, `test/fixtures/rts-*`, `test/rts-*.test.mjs` |

## Preserved recording and services

`src/rts/demo.tar.gz` is the durable 872,306-byte replay asset, SHA256
`9636284d504b30035460301b27e548fa3bc06bd83af0fa54e4de7988c57e5a97`.
It installs at `/usr/share/dolly/rts/rts-high-vs-xhigh`. Astra high is player 1;
Astra xhigh is player 2, which won at frame 27741. The archive contains native
recordings, input logs, manifest/result and exposed traces, not credentials.
Full ignored test histories are not build inputs.

The earlier RTS image remains at <http://localhost:9001/rts-arena/>, release
`deb9d9f90a63cc992df94fab951b52e8b270d73483d58664fec18c676c06a010`.
Its separate relay listens on 9002 and admits localhost:9001 and the test origin
127.0.0.1:9011. Do not start a second relay on that port, print its capability,
read native `auth.json`, or stop/restart it during integration. Refreshing native
login or changing relay origins is an explicit host-side operation. The relay
is an optional Pi inference destination; it does not configure Dolly Codex.

The combined gallery uses <http://localhost:9088/>. Existing tabs keep loaded
images; open a fresh tab after publication. Local releases are preserved in
`build/releases`; external deployment has not been performed by this integration.

## Verification and limits

Default browser tests now include SDL2, the launcher, the full scripted-provider
RTS regression and the complete included split replay. `rts-live` remains opt-in
because it makes real provider calls. The complete replay passed with frame
27741 in both panes, matching final traces, unchanged recordings and no HTTP
requests. Pause, speed changes, EOF review and shell recovery also passed.

An earlier handover run recorded `mouse menu/quit must not stall either player`
during concurrent packaging. Isolated reruns passed; its cause remains
unconfirmed. Frame/time diagnostics are retained in `test/fixtures/rts-match.mjs`;
do not hide a recurrence by increasing timeouts.

An earlier directory enumeration omitted files from a match export. Explicit
required filenames, independent replay downloads and an omitted-entry regression
protect exports, but the enumeration root cause is not isolated. The process
packet limit is 1 MiB versus the broker's 8 MiB; screenshot-history trimming does
not solve that general limit for arbitrarily long conversations.

See [deployment](deployment.md) for sealed artifacts, static export, file-part
delivery and predecessor retention. Do not edit source during sealing: release
acceptance verifies the complete checkout.
