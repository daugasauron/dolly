# Deep hedger: the image and its GUI

- STATUS: OPEN
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
the forward the quotes imply for volatilities (2026-08-12); a start that is not a loaded
checkpoint ("It is VERY suspicious how good the 'starting point' is", 2026-08-07): every fit
starts from equal kernel weights and a random hedger.

## State 2026-11-17

Done: `demos/deep-hedger/`: the `deep-hedger-build` package (dh-gui with ImGui over SDL2, dh-fit
with `mojo build`, both compiled in the image's build) and the `deep-hedger` application (curl,
`gpu@0`, `http@0`). dh-gui starts curl for the chain and dh-fit for the fit as processes and
reads what dh-fit reports; it has four tabs (Volatility, Price, Law, Fit).

Left, and the done-when: `demos/deep-hedger/test/deep-hedger-browser.mjs` passes in Chrome and
Firefox on the GPU, and the page on 9050 loads with no failed request.

Findings:

- The package has to declare `gpu@0`: the build refuses otherwise ("/usr/bin/dh-fit uses gpu@0:
  add REQUIRES HOST gpu@0"), unlike `mojo`, which holds no program that uses it.
- A blank line in a `FILE` body needs its four spaces, or the next line is read as a directive.
- ImGui 1.92.9b's `AddPolyline` has an obsolete overload with `flags` and `thickness` swapped:
  `(points, count, colour, 0, 2)` is ambiguous; the thickness goes as a float.
- Playwright's `mouse.click` did not select an ImGui tab in dh-gui; a move, a press and a release
  120 ms apart do, so the test clicks that way. Buttons took either.
