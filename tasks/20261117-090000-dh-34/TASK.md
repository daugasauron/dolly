# Firefox on a still page: a GPU program waits for a readback, a display program for its first frame

- STATUS: OPEN
- PRIORITY: 160
- TAGS: dh,gpu,firefox,browser,core

Found on 2026-11-17 by the deep hedger's test (`demos/deep-hedger/test/deep-hedger-browser.mjs`),
in Firefox 159 (the installed snap, WebGPU enabled, an Xvfb display, RTX 5070). Chrome 156 showed
none of it in any run.

## Reproduce

In the `deep-hedger` image in Firefox, end `dh-gui` with Ctrl+C and run in the shell, the
terminal in front and nothing else moving on the page:

    dh-fit /tmp/dh/chain.txt 1024 3 60 > /tmp/dh/t.out

About one run in five never returns, nor at `timeout`'s signal: the process is inside a call of
the GPU module. `__dolly.gpu.error` stays empty.

## State 2026-11-17

Counted this day, each run a `dh-fit` process (fits of 20 to 600 iterations, `check`, `time`):

- **A still page** (the shell in front): 5 of 24 runs hung: 4 of 14 fits, 1 of 7 checks, none of
  3 timings; and once `dh-gui` never drew its first frame (`graphicsActive` false after 120 s).
  Which run hangs follows no order of commands (`build/dh-evidence/probe-ff.log`,
  `probe2-ff.log`, `probe3-ff.log`, `probe4-plain.log`, this machine).
- **A page that composites a frame at every refresh** (a 2 px element whose opacity a
  `requestAnimationFrame` loop changes): 12 of 12 fits of 60 iterations returned, 24.4 to 24.9 s
  each (`probe4-animated.log`).
- **`dh-gui` in front**, which redraws thirty times a second, the same `dh-fit` as its child: 2
  runs of 380 iterations, no hang (`build/dh-evidence/shots/firefox-*.png`).

So in Firefox a readback's completion (and a display's first frame) seems to be delivered with
a refresh of the page, and a page with nothing to paint has none. Not looked at: where the GPU
and display modules' clients wait, and whether a pending request can keep the page refreshing.

The deep hedger's test therefore composites a frame at every refresh in both browsers, with a
comment naming this task. Done when the reproduction returns every time in Firefox without
that, and the test has dropped it.
