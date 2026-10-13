# The pages stop sorting images into CPU and GPU: GPU is a host module, and nothing depends on a CPU

- STATUS: CLOSED
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

## Closed (2026-10-14, `990b2e28` and `297c8ea3` on `core/no-cpu-gpu`)

What is gone:

- The start page's "Uses" column: its header, cell, `data-graphics` and
  styles (`menu.html`, `scripts/image-menu.mjs`: `graphics`,
  `graphicsLabels`). A row is the image's name, its description and its
  links, which `test/site-browser.mjs` holds.
- `indicateNoGpu`, the `absent` state and the boot's call
  (`src/page-indicators.mjs`, `src/browser.mjs`). The indicator's element is
  made in `host/gpu/gpu.mjs` again, by the module it belongs to.
- "GPU or CPU, and Save" in the shortcuts' legend, "GPU adapter or CPU" in
  `README.md`, the sentence of `docs/gpu.md` and the clause of
  `docs/browser-boundary.md`.
- Two older phrases of the same kind: `mojo-gpu`'s description on the start
  page said "on a base with a GPU" (now "in an image that declares
  `gpu@0`"), and `docs/display.md` said "GPU programs use `gpu@0`" (now "a
  program reaches the GPU through `gpu@0`").

What the indicator says, for the owner to judge (`host/gpu/gpu.mjs`,
`indicate`); NAME is what the browser calls the adapter:

| `gpu@0` got | Text | Border |
| --- | --- | --- |
| a hardware adapter | `GPU: NAME · shader-f16` or `GPU: NAME · no shader-f16` | grey |
| a software adapter (the browser's fallback adapter, SwiftShader, llvmpipe) | `Software adapter, not a GPU: NAME · no shader-f16` | yellow |
| none | `No GPU: REASON · How to enable WebGPU ↗` | red, and it stays shown |

The software case said `CPU (software GPU): NAME` before. The new words name
the thing the module got, an adapter, and say the two facts about it that the
owner asked to be obvious on 2026-10-01: it is software, and it is not a GPU.
"CPU" is not in it: where a software adapter computes is the browser's
business, and the word had become a label for images.

The indicator follows the session:

- Declared by the image: shown from boot. Refused at boot (no adapter), the
  page stops before ENTRY and the indicator says why, as before.
- `nena enable gpu`: shown once the page has an adapter. Refused, nothing is
  shown: nena prints the reason in the terminal, and the session has no
  `gpu@0`. Before, the refusal stayed in the corner of a session without the
  module for as long as the page lived.
- `nena disable gpu`: the element is removed.
- A session without the module: no element.

Measured in `default` (`build/pages-evidence/probe.log`): Chrome 151
headless, `nena enable gpu` gives `Software adapter, not a GPU: google
swiftshader · no shader-f16`, `nena disable gpu` removes it, enabling again
shows it again. Firefox 155 headless gives no adapter: `nena: gpu@0: the
browser did not provide a GPU adapter`, and the page shows nothing.
`test/nena-browser.mjs` holds both; `test/gpu-indicator-browser.mjs` holds
the declared case (software, no Worker adapter, no WebGPU). The generated
pages of this tree (start page, licences, sessions, custom, `default`'s page,
`llms.txt`, the package index) do not contain the word CPU.

What ran, all passing:

- The source suite (349 tests).
- The whole core suite, `node test/browser-tests.mjs`, in Chromium (237 s)
  and Firefox (288 s), which includes the five tests named above.
- `npm run test:demos -- javascript python`, and `npm run test:demos -- pi`
  twelve times (Chromium), since the change touches the page.

How this slim tree ran them, for whoever continues in it:

- Its registry is narrowed to the 119 images whose static sources it has
  (`build/pages-evidence/images.txt`, by `selectable.mjs` beside it). The
  first whole run failed `test/amy-browser.mjs` alone, at `amy install
  pkgconf` and then `amy install llama`: the packages were not in the
  narrowed registry. `deps.tar.gz` of `zero-ad-build` and the three small
  archives of `llama` were copied into this tree's `dist/static` from
  `work/rust`, and the suite then passed whole.
- `pi-agent` is stale here since the repin, and a slim tree cannot stage its
  closure (no rustc sources). Its twelve runs used the page code of this
  branch with the four recipes, the three documents and the `dolly-docs`
  snapshot of before the repin, put back afterwards.
- A mistake of mine: `npm run build:runtime -- --help` is not a question, it
  is a build, and it removed this tree's runtime from `dist/` before it was
  cut off. `npm run build:runtime` rebuilt it: runtime
  `sha256:ee31111527b5…` and image inputs `sha256:538c5a8aea82…`, the same
  as `work/rust`, so the images of the tree stayed valid. Nothing outside
  this tree was written.

For the integrator:

- `297c8ea3` changes three pinned documents, so `dolly-docs` is repinned and
  `pi-agent`, `pi-local` and `dollyfile-studio` with it: those four rebuild.
  Nothing else is an image input.
- Left as it is: the comment in `demos/mojo/Dollyfile-mojo-gpu`, "in an image
  with a GPU: kernels run here", which `/view/mojo-gpu/` shows. It calls no
  image GPU, and changing a recipe rebuilds the image; whoever next changes
  that recipe can write "an image that declares `gpu@0`".

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
