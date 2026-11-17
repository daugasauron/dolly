# Firefox: a GPU program left waiting for a readback on a still page, and Ctrl+C on a display program with a GPU child

- STATUS: OPEN
- PRIORITY: 160
- TAGS: dh,gpu,firefox,browser,core

Found on 2026-11-17 by the deep hedger's test (`demos/deep-hedger/test/deep-hedger-browser.mjs`),
in Firefox 159 (the installed snap, WebGPU enabled, an Xvfb display, RTX 5070). Chrome 156 showed
none of it in any run.

## Reproduce

In the `deep-hedger` image in Firefox, end `dh-gui` and run in the shell, the terminal in front
and nothing else moving on the page:

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
- **`dh-gui` in front**, which redraws thirty times a second, the same `dh-fit` as its child:
  no fit hung, in 8 runs of the test and 7 of some 380 iterations for pictures.

So in Firefox a readback's completion (and a display's first frame) seems to be delivered with
a refresh of the page, and a page with nothing to paint has none. Not looked at: where the GPU
and display modules' clients wait, and whether a pending request can keep the page refreshing.

**Ctrl+C**, with that frame composited and `dh-fit` running under `dh-gui` when the key came:

- 2 of 16 times `dh-gui` ran on (`graphicsActive` still true and the foreground still
  interruptible a minute later; `probe5-ff-first.log`, the test's run of 13:13). Not looked at:
  whether the key reached the page.
- 2 of 19 times the prompt returned and the first command typed then, a `grep` of a file, did
  not return (the test's run of 15:59, for 14 minutes; once in `probe5-ff`). A third run of the
  test stalled after the fit had been stopped in the GUI first (16:28; ended by hand before the
  place was read).

What the deep hedger's test does about it, each with a comment naming this task: it composites
a frame at every refresh, in both browsers; and it leaves `dh-gui` by the Quit button the GUI
got for it, after Stop, not by Ctrl+C. With both, Firefox passed the two runs made (16:50, 17:06).

Done when the reproduction returns every time in Firefox on a still page, Ctrl+C ends `dh-gui`
with a fit running and the shell answers after it, and the test has dropped the frame.
