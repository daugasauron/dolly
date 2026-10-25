# Speech test: voice's Menu tap is lost in 2 of 6 runs, before "Thinking"

- STATUS: OPEN
- PRIORITY: 110
- TAGS: demo,speech,flaky,0.1.4

## State (2026-10-25)

`node demos/speech/test/speech-browser.mjs` (Chromium) failed in the full round of `500d4329`
(seed `debea04d`) and in 2 of 6 runs looped after it, each with `no button Thinking:` at
`demos/speech/test/speech-browser.mjs:103`. The screen then shows voice's main page (Speak, Send,
Stop, Menu, Erase; Up, Down): the test chose a model (`tap("Choose")`), waited for the chosen
name, tapped Menu, and the menu page never came. The other 4 runs passed (62 s each).

Read so far, not measured: the wait for the chosen name (`waitText(chosen)`) can match text
already on the screen, as Pi's start banner names the default model, so it proves nothing;
voice draws the main page on Choose (`pressed()` in `demos/speech/voice.c`), and a tap is a
DOWN and an UP on one button (`touched()`), whose static `finger` would ignore a DOWN while an
earlier finger never ended. Neither explains a lost tap on a shown Menu.

To do: reproduce with voice logging each touch record and `pressed()` (a build of pi-phone with
it), find where the tap goes, and fix that; then make the test wait for what Choose does.

Done when: 20 runs in a row pass in Chromium.
