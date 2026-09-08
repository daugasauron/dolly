# RTS arena experiment

Branch: `rts-arena`, not deployed. Seven Kingdoms: Ancient Adversaries 2.15.7
and SDL2 compile from pinned source inside Dolly. The game's GPL source and
data are included, with notices and corresponding source. Separate music is
omitted. Audio and thread creation are unavailable; the browser ABI is unchanged.

Build: `npm run image -- rts-arena --package`, then `npm run serve` and open
`/rts-arena/`. Configure OpenRouter with Pi's `/login`, exit Pi, then run:

```sh
rts-arena OPENROUTER_MODEL_1 OPENROUTER_MODEL_2 [seconds]
```

Both models must accept images; Pi's `:low`/`:high` thinking suffixes work.
The default match limit is 600 seconds. Loading the image makes no paid calls.
Escape stops the match, saves replays and returns to Slop. Ctrl-C is the runtime's
forced-cancellation fallback: existing files survive, but final replay capture
and match scratch cleanup are not guaranteed.

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
local HTTP provider, and orderly shutdown. This is not a live-model match.

The key remaining issue is **independent network progress**. HTTP mailbox v4
permits one request in flight across Dolly. A slow model can hold that slot and
delay the opponent. The current experiment cannot fairly compare model latency.
Fixing this needs a deliberately versioned, bounded multi-request design through
the same sole `env.dolly_http_dispatch` edge; no sockets or ambient browser access.
Do not hide the limitation behind artificial decision intervals.

The process-call packet limit is also 1 MiB, below the broker's 8 MiB request
limit. Keeping only the newest image avoids accumulating screenshots into an
oversized request, but does not fix that general payload-limit mismatch.

Still required: live OpenRouter testing with a fresh temporary key, a complete
battle with ordinary game orders, and replay playback/determinism verification.
Keys belong in the live sandbox, never source archives, snapshots or match logs.
