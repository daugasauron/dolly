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

The owner, 2026-11-11 07:25 JST:

> it should be possible to do SLOP pip install x y z in a Dollyfile to build something.

> I think the problem was pip went through some proxy that didnt accept CORS, so netwoprk security
> had to be turned off in playwright/chromium to run the build

## State (2026-11-11)

Investigated, not fixed. Two faults pinned the build between browser versions: one needs an old
enough browser, the other a new enough one.

1. **A build may fetch only its recipes' SOURCE rows.** `dolly-build` runs the build in a
   headless page whose HTTP broker fetches with the browser (`host/http/local-services.mjs`)
   under rules that allow only the recipes' own SOURCE URLs, GET, by exact path
   (`scripts/dolly-build.mjs`, `rules`; `npm run image` likewise,
   `scripts/build-snapshot-browser.mjs`). So `SLOP pip install x` is refused by the policy before
   any request leaves the page, and a SOURCE on a server without CORS headers fails in the
   browser. The way around it that the deployment found, a Chrome switch that turns off web
   security, ties the build to a flag that browsers change. pip's requests went through a proxy
   that sends no CORS headers, and a page cannot read such a host whatever the policy allows.
   PyPI itself does answer them: measured from a page on 127.0.0.1 in Chrome, `/simple/NAME/`,
   `/pypi/NAME/json` and files.pythonhosted.org's wheels are readable, and only `/simple/NAME`
   without its slash fails, on the redirect. Any index mirror or proxy in front of it decides
   anew, and most send no CORS headers. `dolly-build` also launches the browser behind a proxy
   of its own that refuses every host but its SOURCE rows' (for the browser's own traffic), so a
   widened policy alone would still fail there; with the relay the page reaches only its own
   origin, which that proxy lets through.
2. **The snapshot leaves the page by `Uint8Array.prototype.toBase64`** (`savePageSnapshot`,
   `scripts/page-image-build.mjs`), a 2025 addition (Chrome 140, Firefox 133). A build in an older
   Chromium runs to the end and then fails. Nothing states which browsers a build needs.

Reflection: a build should need nothing of the browser beyond what the runtime itself needs, and
no switch at all. And a recipe's ordinary steps, `pip install x y z` among them, should work as
they do in a session. A recipe still grants itself nothing (`docs/dollyfile.md`): the builder,
which is the build's embedding, grants the network. Fix, decided:

- Every builder lets a build's steps fetch over HTTPS as a session's programs do: `dolly-build`
  and `npm run image` admit GET and HEAD to any HTTPS origin beside the SOURCE rows, and the
  site's `/custom/` builder keeps its page's policy. Each origin a build reaches is logged once.
- `dolly-build` and `npm run image` give their pages a relay of their own (the broker's existing
  `relays`, `docs/http.md`, "CORS and relays"), on the page's origin. Node fetches only what the
  page's broker authorized, so CORS and redirects no longer matter, in any browser, with no flags.
  The relay reaches the network as the machine does: through the environment's proxy where
  `HTTPS_PROXY` (and `NO_PROXY`) say so, as a CI runner's often do, and pip's own index settings
  (`PIP_INDEX_URL` in the recipe) name a mirror as on any machine.
- What a step fetches is not part of an image's identity: the same recipe reuses its built image,
  and another machine may fetch newer releases. `docs/dollyfile.md` says so; pinning versions
  (`pip install x==1.2`) or SOURCE rows is how a recipe keeps its bytes.
- The snapshot copy uses nothing newer than the runtime's own floor (a FileReader data URL, or
  `btoa` over pieces), and `docs/embedding.md` names the oldest Chrome and Firefox a build and a
  page support (the floor is at least memory64's: Chrome 133, Firefox 134); `dolly-build` checks
  the browser's version first and says what it needs.
- `docs/embedding.md`, "Your own image", gets a CI section: Playwright's image at
  `playwright-core`'s version, `--browser chromium`, no browser flags, the network a build has,
  and Python packages (`SLOP pip install`, or the packages Dolly builds, as
  [Data Pi](../../demos/pi/data-pi/README.md) INSTALLs NumPy, pandas and Matplotlib).

Done when a test builds, with `dolly-build` in Playwright's Chromium and in Firefox and no browser
flags, a recipe whose `SLOP pip install` takes a package from a local index that sends no CORS
headers and redirects once, once directly and once through a local proxy that `HTTPS_PROXY` names; a recipe with `SLOP pip install` of PyPI packages builds by hand
(recorded here); one build in the oldest versions the docs name succeeds (by hand, recorded
here); and the docs say all of it.
