# Upgrade Pi everywhere

- STATUS: OPEN
- PRIORITY: 200
- TAGS: pi,demo,upgrade

Owner request (2026-10-01): upgrade the Pi coding agent in every image that
ships it (`pi`, `pi-local`, Slopyard, Studio, game agents).

Today `demos/pi/package.json` pins `@earendil-works/pi-coding-agent` 0.84.4,
built from source in `pi-build.dm` (pi-ai, pi-agent-core, pi-protocol,
pi-client, pi-tui, pi-telemetry), with Dolly patches.

## Done when

- Every Pi-bearing image runs the latest upstream Pi release from pinned
  source, each Dolly patch re-justified or dropped, and the pi, local-llm,
  Slopyard, Studio and game-agent demo tests pass in Chrome.
