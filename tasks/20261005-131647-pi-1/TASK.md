# Upgrade Pi to 1.0 everywhere

- STATUS: CLOSED
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

## Upgrade (2026-10-05, `work/pi-1`)

Pi 1.0.3 (tag `v1.0.3`, commit `d78dc83d…`, npm `latest`) is compiled in
`pi-build` from the pinned tag exactly as 0.99.2 was: the same eight
workspaces (chord, telemetry, ai, agent, codemode, mcp, tui, coding-agent),
the same emitted assets, and `pi-quickjs-compat.mjs` unchanged (the six `v`
regexes are byte-identical upstream). `pi --version` prints 1.0.3 in every
Pi image.

Changelog 0.99.2 → 1.0.3, handled:
- 1.0.1 removed `npm-shrinkwrap.json`: npm now hoists Pi's dependencies, so
  `build-pi-runtime-packages.mjs` and `pi-runtime-census.mjs` take a package
  from `node_modules/NAME` and fall back to the one nested copy below a Pi
  package; `package-lock.json` (Dolly's) is now the only pin of them. The
  runtime package set is unchanged (34; `@anthropic-ai/sdk` 0.124 → 0.129).
  `demos/rts/test/rts-launcher.test.mjs` imported pi-tui from the old nested
  path and now imports `@earendil-works/pi-tui`.
- 1.0.0 made the TUI fullscreen by default. Fullscreen enables mouse
  tracking (`tui-alt-screen.ts`, `?1000h…?1006h`), which takes selection and
  Ctrl+Shift+C copy away from Dolly's terminal; the test harness could no
  longer read Pi's screen. `tuiMode: "regular"` in the settings of `pi`,
  `pi-local` and `dollyfile-studio` keeps upstream's other mode.
- 1.0.0 `--provider` without `--model` now fails: no Dolly caller does that
  (the rts and game-agent launchers pass both).
- 1.0.3 renamed `azure-openai-responses`; no Dolly file names it. Skills
  format, discovery and the extension API used by `dolly-tools.js`, the
  local model provider and the game SDK entry points are unchanged.

### Compaction and the default model

The audit's cause is not what happens: `stealth/space-bunny-alpha` is in Pi's
built-in OpenRouter data (0.99.2 and 1.0.3) with a 1,000,000-token context
window, so the threshold was known and is 983,616 tokens; a 1.3 MB transcript
(about 330k tokens) is far below it. `models-store.json` is only the remote
catalog cache. Decision: the image compacts that model above 200k tokens
(`compaction.modelOverrides`, `reserveTokens: 800000`, the pattern upstream
documents for 1M models), because every turn re-sends the whole context
through the browser. `settings.json` also names the owner's model as the
default (`defaultProvider: openrouter`), so the default and the session model
agree out of the box; the audit's `kimi-k2.6` was a model Pi had saved from an
earlier `/model` choice.

Shown in `pi` with the image's settings and no `--model`: a session on
`openrouter/stealth/space-bunny-alpha` with the demonstration threshold lowered
to 6,000 tokens (`reserveTokens: 994000`) emitted three
`compaction_start`/`compaction_end` pairs with reason `threshold`
(`build/pi-evidence/sessions/compaction/run.jsonl`).

### Not moved: the root package.json

The review note suggests a manifest under `demos/pi/`. The source tests of
rts, classicube and game-agent import `@earendil-works/pi-ai` and `pi-tui`
from the root install, so moving the pins means giving those demos their own
manifests too; left for a separate change.

### Verification

Chrome, final images (`pi`, `pi-runtime`, `pi-coding-agent`, `pi-build`,
`pi-local`, `dollyfile-studio` rebuilt with `DOLLY_BUILD_IMAGES=pi,dollyfile-studio,pi-local`):
`demos/pi/test/pi-browser.mjs` and `demos/studio/test/studio-browser.mjs`
pass; `javascript` passes; `local-llm` passes in Chrome on my own Xvfb
(Firefox not run); `node test/core-browser.mjs chromium` and
`npm run -s test:source` (332) pass; `npm run lint:dollyfiles` passes with the
game recipes repinned. Real OpenRouter sessions completed tool-using tasks in
`pi` and `dollyfile-studio` (see `20261005-130240-pi-skills`). Commit
`67a65263`.

Remains, so the task stays open: the game images that install Pi (`bhop`,
`classicube`, `rts-arena`, `slopyard`) are repinned to the 1.0.3 chain but not
rebuilt here; their recipes need no content change (they start Pi in RPC mode
with `--provider` and `--model`, and the SDK entry points Slopyard imports
exist in 1.0.3). Close after the integrator's catalog rebuild and their demo
tests pass.

## Closed (2026-10-06)

Round 2 rebuilt every image that carries Pi 1.0.3, the games included; the
`pi`, `studio`, `javascript`, `bhop`, `classicube` and `rts` demo tests pass on
release `e245b123…` (`20261005-132713-round-1005`).
