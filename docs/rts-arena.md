# RTS arena experiment

Branch: `rts-arena`, not deployed. Seven Kingdoms: Ancient Adversaries 2.15.7
and SDL2 compile from pinned source inside Dolly. The game's GPL source and
data are included, with notices and corresponding source. Separate music is
omitted. Audio and thread creation are unavailable; the browser ABI is unchanged.

Build and serve a separate local release (leaves the normal release untouched):

```sh
npm run image -- rts-arena
DOLLY_BUILD_IMAGES=rts-arena ./scripts/package-pages.sh build/rts-pages.tar.gz build/rts-releases
DOLLY_PORT=9001 npm run serve -- build/rts-releases
```

Open `/rts-arena/`. Configure OpenRouter with Pi's `/login`, exit Pi, then run:

```sh
rts-arena OPENROUTER_MODEL_1 OPENROUTER_MODEL_2 [seconds]
```

Both models must accept images; Pi's `:low`/`:high` thinking suffixes work.
The default match limit is 600 seconds. Loading the image makes no paid calls.
Escape stops the match, saves replays and returns to Slop. Ctrl-C is the runtime's
forced-cancellation fallback: existing files survive, but final replay capture
and match scratch cleanup are not guaranteed.

To watch a saved replay, set `SKCONFIG` to its `player1-game` or `player2-game`
directory, run `seven-kingdoms -noaudio -win`, then press `R` at the main menu.
Upstream loads that directory's `NONAME.RPL` and returns to the menu at EOF.

## How it works

- Two real game processes exchange the upstream multiplayer protocol over
  in-Wasm pipes, at 20 simulation frames/second with a fixed map seed.
- Each Pi RPC session receives only its own player's 800×600 view and fog of
  war. Its sole tool sends ordinary clicks, drags, keys and waits: at most
  16 sequential actions and 2000 ms per batch, one active batch per player.
- Every batch returns a fresh screenshot; an empty batch just observes.
  There are no decision intervals or barriers and the game never waits for
  model decisions. **HTTP requests are currently serialized**, as explained below.
- Model context keeps text/action history and the latest screenshot. Full Pi
  histories, including old screenshots, remain in `/workspace/rts-matches/match-*`,
  alongside timestamped thinking/tool events, execution frames, logs and replays.
- A separate in-Wasm SDL spectator renders both views and the thinking deltas
  the provider actually exposes. It does not manufacture hidden reasoning.

The browser pointer currently supplies left-button input only. Agent tools
synthesize right/middle clicks inside SDL without changing host capabilities.
Swap model arguments for a return match with the opposite starting positions.

## Validation and remaining work

Chrome proofs: `DOLLY_IMAGE=sdl2-build DOLLY_BROWSER_MODE=sdl2
./scripts/test-browser.sh`, then `DOLLY_IMAGE=rts-arena DOLLY_BROWSER_MODE=rts
./scripts/test-browser.sh`. They cover real rendering/input, process reload,
PNG encoding, rejected/cancelled batches, separate player views, continuous
simulation, real Pi RPC/tool/history streaming against an explicitly scripted
local HTTP provider, and orderly shutdown. A normal town click and recruit key
produce a unit; both engines record the same recruitment command/frame, and
both replays play through the upstream loader to EOF with its state CRC checks.
A damaged checksum must report a synchronization failure and exit with status 74.
These are short replay checks, not a completed live-model battle.

HTTP mailbox v4 permits one request in flight across Dolly. A slow model can
delay the opponent; this is accepted for the initial experiment, which is not a
fair model-latency benchmark. The browser contract remains unchanged. There are
no artificial decision intervals.

The process-call packet limit is also 1 MiB, below the broker's 8 MiB request
limit. Keeping only the newest image avoids accumulating screenshots into an
oversized request, but does not fix that general payload-limit mismatch.

The opt-in `rts-live` browser mode runs a paid two-minute OpenRouter match:
`deepseek/deepseek-v4-flash-vision-exp:low` versus `x-ai/grok-4.6:low`. It reads
one key from stdin without echoing, uses a fresh profile, and exports verified
histories/replays to `build/rts-live-match.json` (base64 file contents).
The September 8 live proof completed with 7 DeepSeek actions and 11 Grok actions,
both thinking streams, no API errors, and a clean timed exit. Reported usage was
about $0.048; this is not an invoice or a latency comparison.

```sh
DOLLY_BUILD_IMAGES=rts-arena DOLLY_IMAGE=rts-arena DOLLY_BROWSER_MODE=rts-live ./scripts/test-browser.sh
```

A short live match is not a completed battle to victory. That longer gameplay
check remains. Keys belong in the live sandbox, never source archives, snapshots
or match logs. Ordinary V4 Flash and V4 Pro are text-only; use the vision variant.
