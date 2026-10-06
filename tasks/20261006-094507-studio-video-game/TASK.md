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
