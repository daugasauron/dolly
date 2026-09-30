# Airtime agents

Airtime's Foundry strafe course, playable by hand or by a vision model through an
agent overlay. The game, physics and rendering are unchanged by the agent.

## Images

- `bhop`: Airtime: Foundry — strafe trials and scroll jumping.

Open `/bhop/`; build with `npm run image -- bhop`.

## Use

- A/D plus mouse turning builds air speed; Space or either wheel direction jumps.
  Escape pauses and releases capture, Q exits, R restarts, 1–4 select practice
  sections.
- `bhop-agent` adds the overlay: Backtick switches between you and the agent,
  Tab hides it, Enter sends an instruction, Escape interrupts, Ctrl+Enter
  replaces the task. Settings selects OpenRouter or a local Codex relay
  ([game-agent](../game-agent/README.md)).
- The agent's only tools are `game_input` (up to 128 timed segments of keys and
  mouse deltas, 30 s) and `review_attempt` (archived frames). It sees only the
  960×540 framebuffer: no map, coordinates or physics queries.
- Attempts are recorded under `/workspace/bhop-runs/`; settings and conversation
  under `/home/dolly/.config/bhop`. Save a session to keep them.

## Key files

- [`bhop.dm`](bhop.dm): the game, SDL viewer and input adapter, compiled in Dolly.
- [`agent/`](agent/): mission loop, input codec and replay export.
- Tests: [`test/`](test/).

## Limits

- No task duration or cost cap; the agent retries five seconds after finishing
  until you interrupt it.
- HTML attempt exports use the 64 MiB download limit.

Test: `npm run test:demos -- bhop` ([`test/`](test/)).
