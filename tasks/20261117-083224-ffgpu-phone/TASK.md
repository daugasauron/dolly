# Firefox: at a phone's size with a touchscreen a gpu@0 surface presents one frame and stops

- STATUS: OPEN
- PRIORITY: 150
- TAGS: gpu,firefox,browser,core,0.1.8

Found on 2026-11-17 by the planet's touch test (`feature/planet`, task
`20261116-223911-planet-day`, its probe `build/planet/ffprobe.mjs` in `work/planet`): in
Playwright's Firefox (the installed snap 159) with a touchscreen (`hasTouch`) at 844 by 390, the
game presents one frame and no more, its window left at 1920 by 1080. Without a touchscreen at
that size it draws, and with one at 1600 by 900 and at 1180 by 820 too.

Done when the cause is known and a gpu@0 surface draws on in Firefox at 844 by 390 with a
touchscreen, or the case is shown to be Playwright's and not a phone's.
