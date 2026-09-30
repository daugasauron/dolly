# Add a local Claude relay for the model-driven demos

- STATUS: OPEN
- PRIORITY: 240
- TAGS: demo,agent,relay

Owner goal: a local Claude proxy usable wherever the demos offer OpenRouter/Local Codex models (Pi, Dollyfile Studio, rts-arena, classicube, bhop).

Shape: like demos/game-agent/codex-relay.mjs — a local HTTP service outside the sandbox that holds the credential, admits only exact local origins and a relay-only bearer token, forwards Anthropic Messages requests with the official SDK (standard credential resolution: ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN or an ant auth login profile), streams SSE back, and writes a private Pi models.json for the claude-local provider. It never reads the Claude Code subscription login.

Done when: a mock-upstream test covers token, origin, model allowlist, streaming and abort; each demo's provider menu offers Claude (local proxy); READMEs say how to start it.
