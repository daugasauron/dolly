# Regenerate the demo recordings with a stronger model over OpenRouter

- STATUS: OPEN
- PRIORITY: 250
- TAGS: demo,site,openrouter

## Remaining (2026-10-07)

The Studio recording is done elsewhere (`20261006-094507-studio-video-game`,
closed; the g1 take is on the agents page). Left here: RTS Arena, ClassiCube
and bhop keep their old recordings, because no free model played them
visibly better (takes below) and the owner's rule was free models only. It
waits on one owner decision: which model and budget, if any, for those three
(the round record lists "a model for re-recording RTS Arena" as open for
him). The rig and commands are under "Rerun".

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

## Status (2026-10-06 07:15 JST)

`stealth/space-bunny-alpha` disappeared from OpenRouter at about 16:05 UTC on
2026-10-05: the catalog no longer lists it and every request returns
`404 No endpoints found for stealth/space-bunny-alpha` (still so at 16:15).
Per the owner's rule no paid model was substituted. Only the Studio video is
new; RTS Arena, ClassiCube and bhop keep their previous recordings (see the
candidate takes below for why) and remain to be redone.

## Model decision (2026-10-06 06:40 JST)

The owner delegated the choice: free models only, same key handling.
`stealth/space-bunny-alpha` is still gone. OpenRouter listed 20 zero-price
models at 06:22 (`build/recordings-evidence/free-models.tsv`); the key has
1,000 free-model requests a day. Screened on two direct API steps (a compile
error to fix with tools; a ClassiCube screenshot with a `game_input` tool),
then on a real Pi build step inside Studio on :9003 (write, compile and run a
C program):

| Model | Image | API steps | Pi step in Dolly |
| --- | --- | --- | --- |
| thinkingmachines/inkling(-small):free | yes | 403 "only available on agentic harnesses" | same 403 |
| dots-studio/dots-3-note-preview:free | yes | both valid; scene described correctly; 15-28 s per screenshot step | ok, 11 s, 3 requests |
| nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free | yes | valid but junk fields, 23-63 s per screenshot step; "ResourceExhausted" once | not run |
| google/gemma-4-31b-it:free, gemma-4-26b-a4b-it:free | yes | 429 on every attempt | 429 |
| nvidia/nemotron-3-ultra-550b-a55b:free | no | valid fix, 5 s | ok, 30 s, 5 requests |
| nvidia/nemotron-3-super-120b-a12b:free | no | valid fix, 1 s | ok, 7 s, 4 requests |
| cohere/north-mini-code:free | no | valid fix, 4 s | ok, 8 s, 4 requests |
| poolside/laguna-s-2.1:free | no | 429 twice | not run |

Decision: the game agents use `dots-studio/dots-3-note-preview:free`, the
only free vision model that answered reliably. The Studio take stays: the
free models passed a 10-line step, which says nothing about a 1,000-line
game, and one full take would use a third of the remaining time. Inkling is
gated to registered agent apps; Dolly's Pi sends no attribution and the rig
does not fake one.

## Takes on the candidate (:9003, dots-3-note-preview, 2026-10-06)

- ClassiCube `t4-dots` (task `rig/tasks/classicube-tower4.txt`, effort low,
  17 min, 112 requests, $0, no provider errors): the agent flew out of the
  forest, found open grass, calibrated moves and placed about eight stone
  blocks from above, but never closed a ring or stacked a layer. The new
  "no actions were executed" message worked: after one rejection it split its
  batches. Not better than the old video, so the old one stays.
- RTS `t1-dots` (low vs medium, 540 s, 55 requests, $0): player 1 trained one
  unit and then browsed report screens; player 2 fell into a loop repeating
  the same button coordinates in its thinking and never acted. No building or
  fighting, worse than the old Codex match, so the old one stays. The
  early-input stall did not occur (first input after about 20 s).
- bhop `t1-dots` (effort low, 9 min, 34 requests, $0): four attempts, none
  past the first pads; the agent misread the HUD and repeated near-identical
  inputs. A stream error ("JSON error injected into SSE stream") stopped it
  after 8 minutes. Not better than the old video, so the old one stays.
- Conclusion: no free model available tonight plays these games visibly
  better than the old Codex/GPT-5 Nano recordings, so per the owner's rule
  (free only, stop rather than spend) RTS Arena, ClassiCube and bhop keep
  their old videos. Redo them when a free vision model with reliable tool use
  appears (rerun commands below; `RIG_MODEL` selects the model).

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

- All scripts take `RIG_ORIGIN` (default :9002) and `RIG_MODEL`.
- Studio: `RIG_SCALE=1.25 RIG_ORIGIN=http://localhost:9002 node studio.mjs TAKE prompts/neon-drift.txt medium prompts/neon-drift-play.json`
  (`BUILTIN_MODEL=1` on Pi 1.0 images, `AUTOPILOT=SECONDS` steers Neon Drift
  from the canvas pixels).
- ClassiCube/bhop: `node game.mjs IMAGE TAKE TASK.txt EFFORT MINUTES`; RTS:
  `node rts.mjs TAKE EFFORT1 EFFORT2 SECONDS`.
- Cut: `CRF=33 node cut.mjs PLAN.json OUT.mp4 1920` (plan:
  `build/recordings-evidence/cuts/studio-plan.json`).
