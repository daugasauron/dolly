# Game agents

Shared code for the ClassiCube and Airtime agents: mission loop
([`mission.mjs`](mission.mjs)), settings ([`settings.mjs`](settings.mjs)),
OpenRouter authentication ([`auth.mjs`](auth.mjs)), the control
protocol ([`control.h`](control.h)) and the source-built viewer
([`viewer.cpp`](viewer.cpp)). It also uses the RTS spectator relay, trace and
graphics code, so both install side by side under `/usr/src/dolly/`.

## Local relays

Two relays let the game agents, RTS arena, Pi and Studio use a model account
without its credential entering Dolly. They run on your computer, outside the
browser:

```sh
node demos/game-agent/codex-relay.mjs 9002 http://127.0.0.1:9000    # your Codex login
node demos/game-agent/claude-relay.mjs 9003 http://127.0.0.1:9000   # your Anthropic API key
```

Arguments are the port, then the Dolly page origins. Each prints the path of a
temporary Pi `models.json`; choose that file in the game's or arena's settings.
Never upload native credentials.

- [`codex-relay.mjs`](codex-relay.mjs) reads `~/.codex/auth.json` (run
  `codex login` first) and forwards the Codex responses endpoint.
- [`claude-relay.mjs`](claude-relay.mjs) calls the official Anthropic SDK:
  `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`, else the one-line key in
  `~/.config/dolly/claude-relay.env` (bare or `ANTHROPIC_API_KEY=`; mode 0600
  or it refuses). SDK 0.91.1 reads no `ant auth login` profile, and the relay
  never reads Claude Code's login (`~/.claude`). It serves `POST /v1/messages`
  for the current models its credentials list (Sonnet 5.5, Opus 5.5, Fable 5.1,
  Haiku 4.5) and forwards Pi's thinking and effort unchanged. Usage is billed
  to that API account but reported as $0, so the arena's spending limit does
  not bound it.
- Both are ordinary HTTP destinations reached through the broker, not browser
  imports. They share [`local-relay.mjs`](local-relay.mjs): loopback only,
  exact Host and Origin, a random relay capability, bounded requests, one
  inference path and no redirects.
- Only the relay reads the credential; it exposes no files or processes. Anyone
  holding its capability can spend that account's quota. Stopping it
  invalidates the capability.
- No concurrency cap. The relay once rejected a third active request with HTTP
  429; **the user explicitly asked to remove this cap.** Do not reintroduce a
  two-player or per-request relay limit. The browser's 16-slot HTTP pool is
  separate, intentional transport storage.
- Tests: [`test/`](test/).
