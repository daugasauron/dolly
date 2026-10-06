# Re-record the Dollyfile Studio video: login, model choice, save the recipe, rebuild it in a fresh tab

- STATUS: OPEN
- PRIORITY: 340
- TAGS: site,demo,studio,recording

Owner request (2026-10-06, high priority): recreate the Dollyfile Studio demo
video with "deepseek flash v1 xhigh" through OpenRouter, and make it cooler.
A new API key is in `~/.openrouter`.

## What the video must show

Exactly what any visitor gets when opening the web app, in one continuous
story:

1. Opening Dollyfile Studio and the login flow: pasting the OpenRouter key
   (Pi masks a pasted key with stars; confirm that on the recorded frames).
2. Model selection: picking the model in Pi, on screen.
3. The agent building something worth watching (cooler than the current
   take: judge by the result on screen, not by length).
4. Saving the Dollyfile to the host computer from Studio (the image's
   `download`, the browser's save).
5. A fresh session: the "Run a Dollyfile" page (`/custom/`) with that saved
   file, building and running it, to show that a Dollyfile is shareable and
   rebuilds on any host.

## Constraints

- The key never appears: not in the video (inspect the frames around the
  paste), not in logs, evidence, the task or any commit. Read it from
  `~/.openrouter` at run time only.
- Model: find the exact OpenRouter id for the owner's "deepseek flash v1" and
  run it at its highest reasoning effort ("xhigh"); record the id, the effort
  setting and the cost. This lifts the earlier free-models-only rule for this
  recording only.
- No hidden help: no pre-seeded login, key, model or recipe. If the rig
  presses keys in the built program, the caption says so, as today.
- Record against the release the video will ship with (the current candidate,
  Pi 1.0.3 and the new skills), so the page looks like the deployed one.
- The fresh-session step must be real: a new browser context with empty
  storage, the file chosen through the page's own upload control.

## Today (main `980db936`)

- Current video: `sites/daugasauron.com/agents/videos/dollyfile-studio.mp4`
  (1:57, 7.7 MB), made on 2026-10-05 with a free model that has since left
  OpenRouter; it starts after login and never leaves Studio
  (`20261005-131651-demo-recordings`, sections "Studio take" and "Rerun").
- The rig and cut scripts are in `build/recordings-evidence/rig/` (not
  tracked): `studio.mjs`, `cut.mjs`, on `Xvfb :129`.
- Studio's settings name the bundled local model as default; the video's
  model is chosen by hand on screen.

## Done when

- The new video and poster replace the old ones on the agents page, the page
  test passes, and the frames around the key paste are checked.
- The task records the model id, effort, cost, the prompt, the saved recipe
  and how to rerun.
- It is live after the next deploy the owner asks for.

## Findings (2026-10-06 08:20 JST)

- Blocker: Pi 1.0.3's API-key login does not mask the key. Reproduce on
  `http://localhost:9005/dollyfile-studio/`: in Pi type `/login`, choose
  "Sign in with an API key", type `openrouter`, Enter, then paste any
  `sk-or-v1-...` string: the full value is shown in clear on the
  `Enter OpenRouter API key` line until Enter (checked with a fake key; the
  real key was never pasted). After Enter the dialog closes and only
  "Saved API key for OpenRouter" remains. Cause: upstream
  `packages/coding-agent/src/modes/interactive/components/login-dialog.ts`
  uses a plain `Input` from `pi-tui`, which has no masked mode. A visitor
  sees their key, so a recording "as a visitor would see it" shows it too;
  no take was made.
- Model ids for "deepseek flash v1 xhigh" (OpenRouter catalog, 08:05): no
  "v1" exists. `deepseek/deepseek-v4-flash` (V4 Flash 0423, text only,
  $0.03/$1.28 per M tokens) is the only Flash whose efforts include `xhigh`
  (`xhigh`, `high`); `deepseek/deepseek-v4.1-flash` (V4.1 Flash, text+image,
  $0.30/$1.20) offers `max`, `high`, `low`.

## Takes (2026-10-06, release `09de6685` on :9005)

Model `deepseek/deepseek-v4-flash` with Pi's thinking level `xhigh` (Pi sends
OpenRouter `reasoning: {effort: "xhigh"}`; the model lists `xhigh` and
`high`). The login, model and effort are typed on screen; the key is pasted
from the clipboard with Ctrl+Shift+V. Cost is the key's `usage` before and
after each take (OpenRouter `/api/v1/key`).

- s1 (09:36): masked paste confirmed on the frames (stars only, dialog gone
  after Enter). After 23 minutes the agent's request failed in the browser
  ("Browser could not fetch the URL", Pi gave up after two retries); the same
  body replayed from Node got HTTP 200 with CORS, so treated as transient.
  Stopped before a build. Cost 0.26 USD. Running total 0.26 USD.
- s2 (10:11): the whole script worked end to end: build, Open image, "Save
  the Dollyfile to my computer" (Pi's `download` tool, the page's Save button,
  Chrome's "Download started"), then a fresh profile on `/custom/` rebuilt the
  saved file and ran the same program. But the prompt named the gamedev-sdk
  without its URL; the agent guessed `https://daugasauron.com/Dollyfile-gamedev-sdk`
  (HTTP 404, "this release does not publish that recipe"), wrote its own
  renderer FROM system instead, and the result was a sunset with garbled
  text and no visible road or ship. Not usable. Cost 0.34 USD. Running total
  0.60 USD.
- Seen on every take: Pi's catalog refresh goes to
  `https://pi.dev/api/models/providers/openrouter`, which the browser blocks
  (no CORS), so Pi warns "model catalog could not be refreshed; using cached
  models". The cached catalog has the model.
- s3 (10:33): prompt now names the gamedev-sdk URL. Built FROM it with
  raylib in under 10 minutes, self-test passing, save and fresh rebuild
  worked; but the game draws its sun over the 3D scene and the world does
  not visibly move, so not usable. Cost 0.25 USD. Running total 0.85 USD.
- s4 (10:48): same prompt plus the frame order (2D sky and sun, 3D world
  with a chase camera, HUD) and the world moving toward the camera.
  Result: built in 6.5 minutes, playable, rings and blocks visible, but the
  sun sits on the road behind a tiny ship and crashes end runs in seconds;
  usable as a fallback only. Cost 0.13 USD. Running total 0.98 USD.
- s5 (11:05): a 2D design instead ("Neon Rocks", glowing vector Asteroids on
  the same toolchain), since the text-only model cannot look at its frames
  and 3D layout mistakes were the failure in s3 and s4.
  Result (11:07, after a rig restart): built with one fixed error and the
  full script ran, but the game loops through "WAVE n / GET READY" banners
  with no rocks; not usable. Cost 0.18 USD (plus 0.01 for a run the rig's
  own cost check crashed). Running total 1.17 USD.
- s6 (11:22): the 3D racer again with an exact layout in the prompt (road
  plane, ship and camera positions, horizon from GetWorldToScreen, draw
  order), since the model cannot look at its frames.
  Result (11:31): the final take. Cost 0.08 USD. Running total 1.26 USD
  (the key's OpenRouter `usage`, all six takes; no take passed 0.35 USD).

## Final take: s6

- Release `09de6685` on :9005 (daugasauron.com packaging), Pi 1.0.3 with the
  key-mask patch. Model `deepseek/deepseek-v4-flash`, Pi `/thinking xhigh`
  (OpenRouter `reasoning.effort: "xhigh"`); 51 requests, 0.084 USD.
- Prompt: `build/recordings-evidence/rig/prompts/neon-drift-5.txt` (a 3D
  synthwave racer FROM the published gamedev-sdk, with an exact camera and
  draw-order layout). The rig pastes it; `/login`, the provider name,
  `/model`, `/thinking` and "Save the Dollyfile to my computer." are typed.
- What happens (9 minutes, cut to 2:35): start page → Studio; `/login` →
  API key → OpenRouter, the pasted key shows as stars; `/model` and
  `/thinking xhigh`; the agent reads the skills and SDK recipe and writes
  the game; two in-browser build errors (missing `stdio.h`, a missing
  `REQUIRES HOST http@0` for the base's `amy`) fixed; Open image runs
  "Neon Drift"; on request the agent runs `download`, the rig clicks the
  page's Save button and Chrome saves `Dollyfile-neon-drift`; a new browser
  profile opens `/custom/`, chooses that file with the page's file control,
  rebuilds it in 5 s (published gamedev-sdk artifact reused) and the same
  game runs. The rig presses the game keys (pixel autopilot); captions say so.
- Saved recipe: `build/recordings-evidence/cuts/Dollyfile-neon-drift-s6`
  (not committed).
- Frame check of the committed video: all 180 frames from 24 s to 30 s,
  cropped to Pi's input line, show an empty prompt, then only `*`, then the
  closed dialog ("Saved API key for OpenRouter"); the whole video at one frame
  per 2 s shows no key. The request log, transcript and agent text contain
  neither the key nor `sk-or-v1`.
- 61 frames were dropped from the cut where x11grab caught a window before
  its first paint or mid-resize (white edges); `rig/deglitch.sh`.
- Video 2:35, 5.5 MB (CRF 33); poster from the game in Studio.

## Rerun

With `Xvfb :129` and `DISPLAY=:129`, in `build/recordings-evidence/rig/`:
`RIG_ORIGIN=http://localhost:9005 node studio2.mjs TAKE prompts/neon-drift-5.txt deepseek/deepseek-v4-flash xhigh`,
then `PLAY=16 FRESH=18 node plan2.mjs TAKE "description" > plan.json`,
`CRF=18 node cut.mjs plan.json hq.mp4 1920` and
`CRF=33 ./deglitch.sh hq.mp4 final.mp4`; check the paste frames with the
crop in `framecheck.sh`.
