# Game agents

Shared code for the ClassiCube and Airtime agents: mission loop
([`mission.mjs`](mission.mjs)), settings ([`settings.mjs`](settings.mjs)),
OpenRouter and Codex authentication ([`auth.mjs`](auth.mjs)), the control
protocol ([`control.h`](control.h)) and the source-built viewer
([`viewer.cpp`](viewer.cpp)). It also uses the RTS spectator relay, trace and
graphics code, so both install side by side under `/usr/src/dolly/`.

## Local Codex relay

[`codex-relay.mjs`](codex-relay.mjs) lets game agents use your native Codex login
during development. It runs on your computer, outside the browser:

```sh
node demos/game-agent/codex-relay.mjs 9002 http://127.0.0.1:9000   # port, then Dolly page origins
```

It prints the path of a temporary Pi `models.json`; upload that file in the
game's settings. Never upload the native `~/.codex/auth.json`.

- The relay is an ordinary HTTP destination reached through the broker, not a
  browser import. It binds loopback, checks exact Host and Origin plus a random
  bearer capability, bounds requests, and forwards only the Codex inference
  endpoint without redirects.
- Only the relay reads the login; it exposes no files or processes. Anyone
  holding its capability can spend that account's quota. Stopping it invalidates
  the capability.
- Tests: [`test/`](test/).
