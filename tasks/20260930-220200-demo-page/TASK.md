# Rework the Agents at play page into a plain demo page

- STATUS: OPEN
- PRIORITY: 200
- TAGS: site,demo

Owner goal: sites/daugasauron.com/agents/ becomes a simple demo page without the promotional introduction; each video gets one or two plain sentences. Replace the Dollyfile Studio recording (a Pong-like game) with one where the Studio agent builds a genuinely interesting game inside Dolly.

Done when: the page is short and factual, the new Studio video shows a real build inside the browser, and the site packages.

## Status (2026-10-01 06:20 JST)

- The page is plain (`2acec28`): one or two sentences per video.
- The new Studio recording is blocked only by the Claude relay account's
  credits (retested 05:50: "Your credit balance is too low").
- Ready to run once credits exist (kept outside the repository, in
  `/home/daug/dev/dolly-archive/misc/recording-rig-20261001/`):
  `RIG_DISPLAY=:122 node studio.mjs` starts the relay, a private Xvfb display
  and fullscreen Chrome, boots `dollyfile-studio`, starts Pi on `claude-local`
  (Sonnet 5.5 by default, `STUDIO_MODEL` to change) and asks it to build
  `braille-asteroids`: Asteroids drawn with Braille sub-pixels in 24-bit
  colour, split asteroids, particles, waves, a self-test and an `ENTRY`, then
  opens and plays the result, recording `out/studio-raw.mp4`.
  `cut.sh RAW OUT START:END:SPEED...` trims and speeds it up for the page.
  A dry run at 06:18 reached the prompt; the model call itself is untested.
