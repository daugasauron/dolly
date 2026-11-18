# Deep hedger, done: the image's test, in Chrome and Firefox on the GPU

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: dh,demo,gpu

`demos/deep-hedger/test/deep-hedger-browser.mjs`. It needs a GPU window, so
`demos/run-browser-tests.mjs` lists it among the tests it does not start (task dh-07).

## Closed 2026-11-17

What it does: answers the page's request to `api.marketdata.app` with a lognormal 30% chain of
its own (89 contracts kept, 4 expiries); clicks Load quotes and Fit on dh-gui's frame and waits
for the market's bars and the model's bid line; ends dh-gui with Ctrl+C; runs `dh-fit check`
(ledger to 2e-5, both gradients against differences); runs a fit of 600 iterations of 1,024
paths and asserts that the loss fell twentyfold, that each interval's forward is within 0.4% of
1 and its daily deviation within 12% of the chain's, and that the hedged books' deviation is
under 0.7 of the unhedged.

Last run on the image of commit `357d52eb6`, 2026-11-17 04:04, `DISPLAY=:156 node
demos/deep-hedger/test/deep-hedger-browser.mjs` under the GPU lock:

    deep-hedger: chromium 156.0.8078.47 passed on nvidia blackwell: loss 248.46903368667762 to 0.7730444158050787, risk 37% of unhedged
    deep-hedger: firefox 159.0.1 passed on unnamed WebGPU adapter: loss 248.46903368667762 to 0.7730444158050787, risk 37% of unhedged

The same numbers in four runs of it, on four builds of the image. The source suite
(`node --test 'test/*.test.mjs'`) passes, 396 of 396.
