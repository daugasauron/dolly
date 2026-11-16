# Deep hedger, done: the image is served on 9050 and its page loads clean

- STATUS: CLOSED
- PRIORITY: 120
- TAGS: dh,demo

## Closed 2026-11-17

`http://127.0.0.1:9050/deep-hedger/`, the user unit `dolly-serve-dh` (`node
scripts/serve-checkout.mjs deep-hedger` in `work/dh`, `DOLLY_PORT=9050`), restarted after every
build of the image; the last build is of commit `357d52eb6`.

Checked by a Playwright script on the served page (`work/dh-evidence/shot.mjs`, this machine):
status ready, Load quotes, Fit, every tab, and the list of failed requests and of responses of
400 and over.

- Chrome 156 on the RTX 5070, live chain, 2026-11-17 03:29: adapter "nvidia blackwell", failed
  requests none, the fit at 2.7 iterations a second; pictures of the six tabs in
  `build/dh-evidence/shots/chromium-*.png`.
- Firefox 159 on the same card, 02:27: failed requests none. Playwright's picture of the page
  is blank there; the test reads the frame instead (task dh-24).
- Headless Chrome without a GPU: the chain loads, failed requests none, and Fit ends with
  `enqueue_function: gpu@0: I/O error` in the status line (task dh-07).
- Ending dh-gui with Ctrl+C ends its dh-fit: the fit's output stopped growing, and a timing run
  afterwards had the card to itself.
