# Deep hedger: the image and its GUI

- STATUS: CLOSED
- PRIORITY: 180
- TAGS: dh,demo

Owner (2026-11-16): "The image should launch a GUI that can load option price data from somewhere
(live) [...] And the best attempt you can make at taking my ideas during the project to fit a
model to those prices."

What the owner asked of the earlier GUIs, kept here: follow the fit while it runs (braut,
2026-08-06: "a start button and then I want to follow the model training in realtime"); two views
for all plots, volatility and price, and for each expiry its puts and its calls, a market quote a
vertical bar and the model's bid and ask solid lines, axes that do not move while it trains
(2026-08-11, 2026-08-12); in the money shown as well; distinct colours for bid and ask; no mids;
the forward the quotes imply for volatilities (2026-08-12); random paths with the worst and the
best (2026-08-12); a table of every contract's market and model quotes and plots of how the
hedger hedges (sig-mmd, 2026-07-08); a start that is not a loaded checkpoint ("It is VERY
suspicious how good the 'starting point' is", 2026-08-07): every fit starts from equal kernel
weights and a random hedger.

## Closed 2026-11-17

Done: `demos/deep-hedger/`: the `deep-hedger-build` package (dh-gui with ImGui over SDL2, dh-fit
with `mojo build`, both compiled in the image's build) and the `deep-hedger` application (curl,
`gpu@0`, `http@0`). dh-gui starts curl for the chain and dh-fit for the fit as processes and
reads what dh-fit reports every 20 iterations; six tabs: Volatility, Price, Law, Hedge, Quotes,
Fit. Served on 127.0.0.1:9050 (`dolly-serve-dh`).

Checked on the last image (commit 209e8819c): in Chrome 156 on the GPU, with the live chain, the
fit runs at 2.6 iterations a second beside the GUI and no request fails; the Hedge tab shows the
hedger holding 0.8 of a share against a call deep in the money, nothing against one far out, and
at the forward a position that follows the path (`build/dh-evidence/shots/`, this machine).
Without a GPU the status line says `enqueue_function: gpu@0: I/O error` and the button is Fit
again. `demos/deep-hedger/test/deep-hedger-browser.mjs` (a fixture for the service, clicks on
the frame, then `dh-fit check` and a fit) passes in Chrome 156 and in Firefox 159 with the same
numbers: loss 248.469 to 0.773, 37% of the unhedged risk left.

Not checked: a token, and so any symbol but AAPL.

Findings:

- The package has to declare `gpu@0`: the build refuses otherwise ("/usr/bin/dh-fit uses gpu@0:
  add REQUIRES HOST gpu@0"), unlike `mojo`, which holds no program that uses it.
- A blank line in a `FILE` body needs its four spaces, or the next line is read as a directive.
- ImGui 1.92.9b's `AddPolyline` has an obsolete overload with `flags` and `thickness` swapped:
  `(points, count, colour, 0, 2)` is ambiguous; the thickness goes as a float.
- Playwright's `mouse.click` did not select an ImGui tab in dh-gui; a move, a press and a release
  120 ms apart do, so the test clicks that way. A click sent as the display first becomes active
  is lost: the test waits for dh-gui's labels.
- Playwright's screenshot of the page is blank in the installed Firefox; the test reads the
  frame through `waitForDisplay` instead.
- The plain `npm run image` does not finish in this tree: it stages every image's sources
  again (5 GB while it runs) and stops at "no verified Go seed: run
  demos/go/build-go-toolchain.sh once". The tree's catalog stays narrowed to `deep-hedger`,
  `default` and `mojo-gpu`; what the run left in `build/` was removed.
