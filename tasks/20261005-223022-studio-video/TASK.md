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
