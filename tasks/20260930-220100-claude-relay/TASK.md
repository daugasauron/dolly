# Add a local Claude relay for the model-driven demos

- STATUS: OPEN
- PRIORITY: 240
- TAGS: demo,agent,relay

Owner goal: a local Claude proxy usable wherever the demos offer OpenRouter/Local Codex models (Pi, Dollyfile Studio, rts-arena, classicube, bhop).

Shape: like demos/game-agent/codex-relay.mjs — a local HTTP service outside the sandbox that holds the credential, admits only exact local origins and a relay-only bearer token, forwards Anthropic Messages requests with the official SDK (standard credential resolution: ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN or an ant auth login profile), streams SSE back, and writes a private Pi models.json for the claude-local provider. It never reads the Claude Code subscription login.

Done when: a mock-upstream test covers token, origin, model allowlist, streaming and abort; each demo's provider menu offers Claude (local proxy); READMEs say how to start it.

## 2026-10-01 01:45 JST

The relay starts from `~/.config/dolly/claude-relay.env`, lists Sonnet 5.5,
Opus 5.5, Fable 5.1 and Haiku 4.5 (models API), and forwards requests; the
ClassiCube settings accept its `models.json`. Every inference request then fails
upstream: "Your credit balance is too low to access the Anthropic API." Demo
recordings on the relay need credits on that account. Mock-upstream tests pass
(`demos/game-agent/test/claude-relay.test.mjs`, 5/5).
