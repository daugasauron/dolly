# The pages stop sorting images into CPU and GPU: GPU is a host module, and nothing depends on a CPU

- STATUS: OPEN
- PRIORITY: 320
- TAGS: page,gpu,owner

Owner (2026-10-13): "I HATE that you added the "Uses" category CPU/GPU. Thats
completely against the architecture. GPU is just a module, and the other
programs has no dependency on being run on a CPU, they only need POSIX.
Reflect on this."

Done when: the start page has no "Uses" column and no image is called `CPU`
or `GPU` anywhere on the pages; a page whose session has no `gpu@0` says
nothing about graphics hardware; a page whose session uses `gpu@0` still
says which adapter it got and when that adapter is a software one, which is
what the owner asked for on 2026-10-01; the shortcuts' legend, the documents
and the tests follow; in Chromium and Firefox.

## As filed (2026-10-13, main `37bbe23a`)

What was added on 2026-10-13 (`46a6cb94`, `8a7561d8`, merged by the
integrator in that day's round) to close
[gpu-visibility](../20261001-232300-gpu-visibility/TASK.md):

- `menu.html` and `scripts/image-menu.mjs`: a "Uses" cell in every row of the
  start page, `GPU` for an image that declares `gpu@0`, `CPU` for every
  other image that opens.
- `src/page-indicators.mjs` (`indicateNoGpu`): on a page without `gpu@0` the
  corner indicator says `CPU: this image has no GPU module`.
- The legend of the shortcuts: "GPU or CPU, and Save".

Why it is wrong:

- The owner's sentence of 2026-10-01 was about the module's users:
  "everything that uses GPU should be obvious. The user should always know
  if GPU is used or if there's some CPU fallback in place." The indicator on
  a page with `gpu@0` (the adapter's name, or that it is a software adapter)
  already did that. The change answered a question nobody asked, "what is
  everything else", and invented a class for it.
- The architecture has no such class. An image has a list of host modules,
  and `gpu@0` is one of them, as `audio@0` or `pty@0` is. A program is
  compiled against the POSIX-like contract; a CPU is not something it
  depends on, so it is not something a page can say it uses.
- Since `nena@0` it is also false: `default`'s page says "this image has no
  GPU module", and one command later the session has it.

To do:

- Remove the "Uses" column, `indicateNoGpu` and its state, the legend's
  words, and what the tests assert of them (`test/site-browser.mjs`,
  `test/indicators-browser.mjs`).
- Keep the indicator where `gpu@0` is in use, following the session: shown
  when the module is declared or enabled with `nena`, gone when it is
  disabled.
- A demo that needs WebGPU says so in its row's own description already
  ("Requires WebGPU"), and an image's modules are on its recipe's page.
  Nothing else is needed on the start page.
- `docs/gpu.md` and `docs/browser-boundary.md` gained the "no module" text on
  2026-10-13: take those sentences out (they repin the docs package and the
  images that install it).
