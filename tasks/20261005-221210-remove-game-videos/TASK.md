# Remove the bhop and ClassiCube demo videos for now

- STATUS: OPEN
- PRIORITY: 200
- TAGS: site,demo,cleanup

Owner request (2026-10-06): remove the bhop and ClassiCube demo videos, for
now.

## Today (main `61ae3bea`)

- `sites/daugasauron.com/agents/index.html` shows four recordings; the
  ClassiCube section is at line 44 and the Bhop section at line 51.
- Tracked media: `agents/videos/classicube.mp4` (24.2 MB) and `bhop.mp4`
  (10.0 MB), with posters `agents/posters/classicube.png` (0.7 MB) and
  `bhop.png` (0.3 MB). `dollyfile-studio.mp4` and `rts-arena.mp4` stay.
- `test/site-release.test.mjs:34` expects four `<video>` elements on the page.
- The live site (release `223b8f9e…`) still serves both until the next deploy.

## Work

Remove the two sections from the agents page, delete the two videos and their
posters, and adjust the page test to what remains. Leave the images and their
routes alone: only the recordings go. "For now": new recordings are
`20261005-131651-demo-recordings`; say there that these two slots are empty.

## Done when

- The agents page lists only the Studio and RTS recordings, the four media
  files are gone from the tree, and the source suite passes.
- The change is live after the next deploy the owner asks for.
