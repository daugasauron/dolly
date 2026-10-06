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
- g3 (19:32, `neon-drift-8.txt`): g1's prompt plus the EXPORTS rule and a
  score that ticks with distance.
