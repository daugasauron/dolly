# Regenerate the demo recordings with a stronger model over OpenRouter

- STATUS: OPEN
- PRIORITY: 250
- TAGS: demo,site,openrouter

Owner (2026-10-05): "Use the openrouter API key in ~/.openrouter to regenerate
some demos, the current ones are nice regarding format but the results in the
videos are very underwhelming."

## Work

Find how the current recordings were made (`demos/game-agent`, the site's demo
page, `20260930-220200-demo-page`). Keep the format. The owner chose the model
(2026-10-05): `stealth/space-bunny-alpha` on OpenRouter, currently free. Choose
tasks whose result is visibly good on screen, record against the
local release candidate, and replace the recordings. Record the model, prompt,
selection rule and cost of each here.

The key is read from `~/.openrouter` at run time. It is never printed, logged,
committed, or sent anywhere but openrouter.ai. If the model stops being free, stop and report before spending.

## Done when

- The local release candidate's demo page shows the new recordings.
- Costs and the before and after are recorded here.

## Status (2026-10-06 01:15 JST)

`stealth/space-bunny-alpha` disappeared from OpenRouter at about 16:05 UTC on
2026-10-05: the catalog no longer lists it and every request returns
`404 No endpoints found for stealth/space-bunny-alpha` (still so at 16:15).
Per the owner's rule no paid model was substituted. Only the Studio video is
new; RTS Arena, ClassiCube and bhop keep their previous recordings and must be
redone when a free model is available again.

## Studio take (final for now)

- Release: localhost:9002 (deployed 2026-10-02 release, Pi 0.99.2, old skills).
  The :9004 preview (Pi 1.0.3, new skills) publishes no `gamedev-sdk`, so a
  raylib game cannot be built there; redo on the full candidate if wanted.
- Model `stealth/space-bunny-alpha`, `--thinking medium`; cost $0 on all 66
  requests; no key in any request or response.
- Prompt: `build/recordings-evidence/rig/prompts/neon-drift.txt` (an original
  3D raylib game on the gamedev-sdk toolchain, with the dolly/raylib input
  hint and the bhop recipe named as an example loop).
- What happens (21 minutes, cut to 1:57): the agent reads the skill, the SDK
  recipe and raylib's headers, writes about 1,000 lines of C, compiles them in
  Studio against stub headers and fixes a failed self-test, writes and lints a
  1,012-line Dollyfile; `dollyfile-build` fails on `rlSetClipPlanes` (missing
  `rlgl.h`), it adds the include and the rebuild succeeds in 6 s; Open image
  runs "Neon Drift" (3D road, wireframe skyline, crash particles, shields,
  game over and restart) at full speed. The rig presses scripted keys; the
  caption says so. Recipe kept at `build/recordings-evidence/cuts/Dollyfile-neon-drift`.
- Before: 3:06, 6.6 MB, Codex `gpt-5.6-luna`, a top-down game whose player
  barely moved. After: 1:57, 8.0 MB (CRF 33), poster from the game.
- Selection: of five Studio trials, t2 is the only complete one. t1 was cut
  short by a rig bug; t3 to t5 ran on :9004 drawing into `dolly/display.h`
  and died on provider errors (below).

## Findings

- OpenRouter intermittently returned `502 Provider returned an empty
  response` or `JSON error injected into SSE stream` inside the SSE stream
  (from about 15:15 UTC). Pi 1.0.3 retries some of these; Pi 0.99.2 and the
  game overlays stop ("Agent error · Retry task"). A request carrying an
  invalid PNG (the agent's hand-written encoder, read back with Pi's read
  tool) failed every time and ended that session.
- ClassiCube: three 15 to 20 minute trials built nothing. The agent walked
  into the lake by the spawn, read rejected over-long batches as a frozen
  game, and stopped on a provider error. Fixed in `c896f223`: the rejection
  now says no actions were executed. Flying (Z, Q/E) and placing straight
  down worked better; `rig/tasks/classicube-tower4.txt` is the next task to try.
- Not Dolly defects, seen in transcripts: agents used GNU-only `grep -o`,
  `grep PATTERN -A N` after the operand, `sed -i` and `head -n -1`; each failed
  with a usage message and the agent adapted.

## Rerun

Rig: `build/recordings-evidence/rig/` (kept out of the repository). Start
`Xvfb :129 -screen 0 1920x1080x24 -nolisten tcp`, then with `DISPLAY=:129`:

- Studio: `RIG_SCALE=1.25 RIG_ORIGIN=http://localhost:9002 node studio.mjs TAKE prompts/neon-drift.txt medium prompts/neon-drift-play.json`
  (`BUILTIN_MODEL=1` on Pi 1.0 images, `AUTOPILOT=SECONDS` steers Neon Drift
  from the canvas pixels).
- ClassiCube/bhop: `node game.mjs IMAGE TAKE TASK.txt EFFORT MINUTES`; RTS:
  `node rts.mjs TAKE EFFORT1 EFFORT2 SECONDS`.
- Cut: `CRF=33 node cut.mjs PLAN.json OUT.mp4 1920` (plan:
  `build/recordings-evidence/cuts/studio-plan.json`).
