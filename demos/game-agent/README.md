# Game agents

Shared code for the ClassiCube and Airtime agents: mission loop, settings,
OpenRouter/Codex authentication, the control protocol and the source-built
viewer. It imports the RTS spectator relay, trace and graphics code, so both
directories install side by side under `/usr/src/dolly/`.

`codex-relay.mjs` is an optional local development relay that lets Pi agents in
the game images use a native Codex login. It runs outside the browser; see the
Codex relay section of [the boundary review](../../docs/browser-boundary.md).
