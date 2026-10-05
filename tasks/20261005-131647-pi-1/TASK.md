# Upgrade Pi to 1.0 everywhere

- STATUS: OPEN
- PRIORITY: 280
- TAGS: pi,demo,upgrade

Owner (2026-10-05): "Upgrade to pi 1.0" and "Upgrade the dollyfile studio
image, the skills are outdated."

The catalog ships Pi 0.99.2 (`demos/pi`). Images: `pi-build`,
`pi-coding-agent`, `pi-runtime`, `pi`, `pi-local`, `dollyfile-studio`, and the
games that install Pi.

Also from the sandbox audits:
- Pi's transcript never compacts: `models-store.json` in the image is 2 bytes,
  so the context window is unknown locally (`~/Downloads/AUDIT-session-latency.md` §3.1).
- `settings.json` names `moonshotai/kimi-k2.6` while the environment sets
  `PI_MODEL=stealth/space-bunny-alpha` (`~/Downloads/AUDIT-sandbox-painpoints.md` §11).

The skills are `20261005-130240-pi-skills`, done by the same agent.

## Done when

- Pi 1.0.x is in every image that carries Pi; breaking changes from the
  changelog are handled, not patched around.
- The `pi`, `studio`, `local-llm` and `javascript` demo tests pass.
- A real session over OpenRouter (`stealth/space-bunny-alpha`, the owner's choice,
  key in `~/.openrouter`) completes a tool-using task in `pi` and in
  `dollyfile-studio`, and compaction is shown to trigger.

## Review note (2026-10-05, `20261005-131642-big-picture`)

The root `package.json` lists `@earendil-works/pi-*` as the core's only
runtime dependencies, so the core manifest pins a demo's inputs ("the core
never depends on `demos/`"). While bumping them to 1.0, consider moving them
to a manifest under `demos/pi/`.
