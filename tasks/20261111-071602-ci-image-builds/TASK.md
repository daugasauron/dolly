# Building an npm user's image in CI: CORS, a browser flag and toBase64

- STATUS: OPEN
- PRIORITY: 350
- TAGS: npm,build,python,snapshots,0.1.6

The owner, 2026-11-11 07:15 JST, building a project of their own (Pi with custom extensions,
Python with some Python packages) with `dolly-build` in CI:

> pip needed internet to install stuff (matplotlib etc) but CORS blocked it, so
> playwright/chromium was launched with some --unsafe flag to ignore CORS, but it seems this flag
> has been removed in some newer versions (?) so upgrading caused it to fail. Secondly, the
> snapshot thing use some toBase64 call that only exist in new chromium (?) so I had to upgrade,
> luckily I was able to find one version that has toBase64 and where the cors worked. This was
> super annoying, I want it documented and I want you to investigate and reflect on how to fix it
> to make things smooth.

## State (2026-11-11)

Investigated, not fixed. Two faults pinned the build between browser versions: one needs an old
enough browser, the other a new enough one.

1. **The build's network is the page's `fetch`.** `dolly-build` runs the build in a headless
   page whose HTTP broker fetches with the browser (`host/http/local-services.mjs`), allowing only
   the recipes' own SOURCE URLs, GET, by exact path (`scripts/dolly-build.mjs`, `rules`). So a
   SOURCE on a server that sends no CORS headers fails in every browser, and any other request,
   such as pip asking an index, is refused by the policy. The way around it that the deployment
   found, a Chrome switch that turns off web security, ties the build to a flag that browsers
   change.
2. **The snapshot leaves the page by `Uint8Array.prototype.toBase64`** (`savePageSnapshot`,
   `scripts/page-image-build.mjs`), a 2025 addition (Chrome 140, Firefox 133). A build in an older
   Chromium runs to the end and then fails. Nothing states which browsers a build needs.

Reflection: a build should need nothing of the browser beyond what the runtime itself needs, and
no switch at all; and an image is the same bytes from the same inputs only if its build fetches
nothing but its pinned sources, so "pip resolves against PyPI during the build" stays refused by
design, and the refusal has to explain itself. Fix, decided:

- `dolly-build` relays the build's remote requests through its own local server, on the page's
  origin: Node fetches exactly what the rules allow and refuses the rest, while the page's broker
  still authorizes each request as now. CORS no longer applies, in any browser, with no flags.
- A refused request reaches the build log with its URL and the rule: a build fetches only its
  recipes' SOURCE rows.
- Python packages: INSTALL the packages Dolly builds (NumPy, pandas, Matplotlib, as
  [Data Pi](../../demos/pi/data-pi/README.md) does), or pin each sdist or wheel as a SOURCE and
  `pip install --no-index` it. Both go in the docs, with an example.
- The snapshot copy uses nothing newer than the runtime's own floor (a FileReader data URL, or
  `btoa` over pieces), and `docs/embedding.md` names the oldest Chrome and Firefox a build and a
  page support (the floor is at least memory64's: Chrome 133, Firefox 134); `dolly-build` checks
  the browser's version first and says what it needs.
- `docs/embedding.md`, "Your own image", gets a CI section: Playwright's image at
  `playwright-core`'s version, `--browser chromium`, no browser flags, what network a build has,
  and Python packages; Data Pi's workflow is its example.

Done when a test builds, with `dolly-build` in Playwright's Chromium and in Firefox and no browser
flags, an image whose SOURCE comes from a local server that sends no CORS headers; a refused
request's log line names its URL; one build in the oldest versions the docs name succeeds (by
hand, recorded here); and the docs say all of it.
