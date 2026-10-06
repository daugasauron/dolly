# Studio video: same structure, a game whose graphics work and look good

- STATUS: OPEN
- PRIORITY: 338
- TAGS: site,demo,studio,recording

Owner (2026-10-06, after watching the video from `20261005-223022-studio-video`
on localhost:9005): "The structure of the new dollyfile studio game is
excellent, but the game itself is very underwhelming (the graphics don't
really seem to work as expected). You can use a lot more budget, I want a
cooler result but the same structure."

Keep the structure exactly: a visitor opens Studio, signs in with the key
shown as stars, picks the model, the agent writes a game and its Dollyfile,
builds it in the browser and fixes its errors, the game runs, the recipe is
saved to the host, and a fresh browser rebuilds the same game from that file
with "Run a Dollyfile".

## Work

- First establish why "Neon Drift" looks wrong, from the frames and by running
  the saved recipe (`build/recordings-evidence/cuts/Dollyfile-neon-drift-s6`
  in `work/recordings`): the model's code, the prompt, or a rendering defect
  in the published `gamedev-sdk` (raylib over `gpu@0`). A defect in Dolly is
  filed as its own task and fixed before recording around it.
- Then a better result: a game that is visibly good on screen and plays
  correctly in the take. More takes, a better prompt, and a stronger model if
  the chosen one cannot do it (the first video used
  `deepseek/deepseek-v4-flash` at `xhigh`, 1.26 USD over six takes). Spending
  cap for this task: 50 USD in total; record the cost per take.
- The key-paste frame check is repeated on the final video.

## Done when

- The agents page shows the new video with the same seven steps, the game's
  graphics are correct, and the task records the cause of the first result,
  the model, prompt, cost and how to rerun.

## Why "Neon Drift" looked wrong (2026-10-06 18:50 JST)

The model's code, not the SDK. Reproduced by rebuilding the saved recipe on
:9005 `/custom/` (release `c60a2c6f`) and reading the display canvas:

- The game never calls `ClearBackground`. raylib's `BeginDrawing` does not
  clear, so the software renderer's depth buffer keeps every earlier frame's
  nearest depth: the scene is right for the first seconds, then the ship's
  cubes show striped holes and the road lines break into dashes (visible
  with the ship still centred, 20 s in). Adding the one line
  `ClearBackground(C_BLACK);` after `BeginDrawing()` and rebuilding gives a
  solid ship and complete lines after 25 s and while steering
  (`build/recordings-evidence/diag/nd-quad.png` before, `fix-pair.png` after).
- The block fade is inverted (`fade = 1` at z=-200 falling to 0 at z=-100,
  and blocks under 0.05 are not drawn or collided with), so blocks vanish
  long before they reach the ship: nothing to dodge, no crashes.
- The road's cross lines never draw (the loop adds to z and breaks at once),
  so nothing on the road shows the motion.
- Steering moves only on frames that carry a key event (no held-key state).

raylib's 3D primitives in the published `gamedev-sdk` (software renderer,
`DrawCube`, `DrawCubeWires`, `DrawLine3D`, `DrawSphere`, depth test) draw
correctly once the frame is cleared; no Dolly defect found. The next prompt
states the frame order with `ClearBackground`, block brightness, scrolling
cross lines and held-key input explicitly.

## Takes (cap 50 USD in total, 15 USD per take)

All on :9005 release `c60a2c6f`, `deepseek/deepseek-v4-flash`, `/thinking xhigh`.

- g1 (18:50, prompt `rig/prompts/neon-drift-6.txt`): 14 minutes, 26
  requests, 0.09 USD. One build error fixed; a network error
  (`ERR_NETWORK_CHANGED`) stopped Pi once and the rig typed "Continue.".
  The game is right: solid blocks with wire edges, neon towers, scrolling
  grid, sun and stars, rings; the rig's pixel autopilot dodges blocks and
  collects rings for 30 s with all shields. Save and fresh rebuild worked.
  Usable; kept as the fallback. Running total 0.09 USD.
- g2 (19:06, `neon-drift-7.txt`: the same rules plus polish: banking ship
  model, rails, ring bursts): void. The recipe built green but had no
  `EXPORTS TOOL neon-drift`, so the image kept no game binary and Open image
  showed a blank terminal: raised as `20261006-103256-entry-missing`. With
  the export added by hand the game runs but looks worse than g1 (a small
  odd ship, an early game over). Stopped after the build, about 0.06 USD.
- g3 (19:32, `neon-drift-8.txt`: g1's prompt plus the EXPORTS rule and a
  score that ticks with distance): lost two minutes in, when the machine ran
  out of memory and was rebooted (19:34 to 19:54). Not repeated: g1 already
  meets the task, and one more variant is not worth load on the owner's
  desktop right after an out-of-memory reboot.
- Cost of this task: 0.17 USD (the key's OpenRouter usage went from 1.259 to
  1.427 USD): g1 0.09, g2 about 0.06, g3 about 0.01. No stronger model was
  needed.

## Final take: g1 (committed 2026-10-06 20:00 JST)

Left OPEN for the owner's verdict on the result; the done-when items are met
on `work/demo-recordings`.

- Release `c60a2c6f` on :9005 at the start and the end of the take. Model
  `deepseek/deepseek-v4-flash`, Pi `/thinking xhigh`; 26 requests, 0.09 USD.
- Prompt: `build/recordings-evidence/rig/prompts/neon-drift-6.txt`. It keeps
  the request (a 3D synthwave racer FROM the published gamedev-sdk) and adds
  the rules the model cannot check without seeing the screen: clear every
  frame, draw order, a fixed camera and road layout, cross lines that scroll,
  14 bright blocks spread along the road, held-key input.
- What the game shows: a starry purple-to-orange sky, a banded sun on the
  horizon, a dark road with a violet grid scrolling toward the camera, rows
  of cyan and pink wireframe towers, solid orange, teal and magenta blocks
  with white edges, golden rings, a cyan ship with a pink cockpit. The rig's
  pixel autopilot (captioned) steers around blocks and through rings for 22 s
  with all three shields; the fresh-browser rebuild plays the same way.
- Known limits of this take: the speed readout stays at 60 and the score
  only counts rings; Pi stopped once on a network error and the rig typed
  "Continue." (captioned).
- The seven steps are unchanged; the paste was checked on the committed
  file (sha256 `5825f111…`): all 180 frames from 24.5 s to 30.5 s of Pi's
  input line show the typed `openrouter`, an empty prompt, only `*`, then the
  closed dialog; the whole video at one frame per 3 s shows no key; the
  request log and transcript hold neither the key nor `sk-or-v1`.
- Video 2:47, 8.3 MB (CRF 33, 47 half-painted capture frames dropped);
  poster from the game. Saved recipe:
  `build/recordings-evidence/cuts/Dollyfile-neon-drift-g1` (not committed).

## Rerun

As in `20261005-223022-studio-video`, with the prompt above:
`RIG_ORIGIN=http://localhost:9005 node studio2.mjs TAKE prompts/neon-drift-6.txt deepseek/deepseek-v4-flash xhigh`
(now inside `systemd-run --user --scope -q -p MemoryMax=8G -p MemorySwapMax=0`),
then `PLAY=22 FRESH=20 node plan2.mjs TAKE "description" > plan.json`,
`CRF=18 node cut.mjs plan.json hq.mp4 1920`, `CRF=33 ./deglitch.sh hq.mp4
final.mp4` and `./pastecheck.sh final.mp4 24.5 30.5 OUT_DIR`. To inspect a
saved recipe's frames: `drive.mjs` with `custom-run.js` and `grab.js`.
