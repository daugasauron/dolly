# ClassiCube agent world

ClassiCube in a local shared block world, compiled in Dolly over SDL2, with up
to four players, each optionally driven by its own Pi agent.

## Images

- `classicube`: Explore and build in a block world, with an optional agent.
- `classicube-build`: ClassiCube with the Dolly SDL2 software renderer.

Open `/classicube/`; build with `npm run image -- classicube`.

## Use

- Tab hides or shows the interface; click the game to capture the mouse. WASD
  moves, Space jumps, clicks break and place, B opens the inventory, Escape
  releases capture.
- Backtick switches between you and the agent; `[` and `]` switch players;
  **+ Add player** adds one. Enter writes an instruction, Ctrl+Enter replaces the
  task, Escape interrupts, Ctrl+, opens settings.
- Settings selects OpenRouter (sign-in or API key) or a local Codex relay
  ([game-agent](../game-agent/README.md)), a vision model and effort. Starting or
  restoring makes no model calls.
- The agent's only tool is `game_input`: up to 16 actions and 2 s of input per
  batch, then a fresh 640×480 screenshot. There are no world queries.
- Settings, conversations and the roster live under
  `/home/dolly/.config/classicube`; the world autosaves to
  `/home/dolly/classicube/maps/agent-world.cw`. Save a session to keep them.

## How it works

- [`classicube.dm`](classicube.dm) compiles pinned upstream C with
  [`platform.c`](platform.c), [`window.c`](window.c) and [`input.c`](input.c);
  [`classicube-agent.dm`](classicube-agent.dm) adds the viewer and supervisor.
- A Janis server ([`agent/room.mjs`](agent/room.mjs)) owns the map and exchanges
  Classic protocol packets with the clients through private files in WasmFS. The
  socket wrapper accepts only that room: no host sockets, no browser authority.
- Tests: [`test/`](test/).

## Limits

- Classic v7 protocol without extensions: ASCII chat, 50-block palette.
- Skins, web texture packs and audio are disabled. Unwatched clients run at 15 FPS.
- No task time or cost cap; an idle agent resumes its default activity.
