# RTS arena

Seven Kingdoms: Ancient Adversaries 2.15.7 compiled inside Dolly, with matches
between two vision-model Pi players and replays of recorded matches.

## Images

- `rts-arena`: Watch a Seven Kingdoms replay or start a vision-model match.
- `rts-build`: Seven Kingdoms and its local multiplayer adapter.

Open `/rts-arena/`; build with `npm run image -- rts-arena`.

## Use

- The launcher offers a bundled replay, OpenRouter key setup, local Codex or
  Claude relay import ([game-agent](../game-agent/README.md)) and model menus. **Start match** begins
  model calls; loading the image makes none.
- From the shell: `rts-arena [PROVIDER::]MODEL_1 [PROVIDER::]MODEL_2 [seconds] [USD]`
  (defaults 600 s and $1 of reported cost; not a billing guarantee).
- `rts-arena --replay /workspace/rts-matches/MATCH` replays a match with its
  traces; `seven-kingdoms -noaudio -win -replay FILE.RPL` plays a bare recording.
  Escape exits; Ctrl+C force-cancels and may lose the final replay.

## How it works

- Two game processes speak the upstream multiplayer protocol over in-Wasm pipes
  ([`seven-kingdoms-dolly.patch`](seven-kingdoms-dolly.patch)).
- Each Pi session sees only its player's 800×600 view. Its one tool sends up to
  16 clicks, drags, keys and waits (2 s) and returns a fresh screenshot. The game
  never waits for the model and players get no game guide.
- An SDL spectator ([`spectator/`](spectator/)) shows both views and the thinking
  each provider exposes.
- Matches, histories, replays and traces are saved under `/workspace/rts-matches/`.
- Other key files: [`arena.cpp`](arena.cpp), [`input.cpp`](input.cpp),
  [`rts-arena.dm`](rts-arena.dm); tests in [`test/`](test/).

## Limits

- Audio, separately distributed music and thread creation are unavailable.
- Recordings are not portable across game builds.
- Process packets are limited to 1 MiB, so very long conversations can outgrow a
  request.
