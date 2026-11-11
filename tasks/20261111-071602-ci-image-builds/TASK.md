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

## State (2026-11-11, evening)

Fixed on `fix/npm-feedback`, not yet run from packed packages: `dolly-build`'s page sends each
remote request its broker admits to a relay on `dolly-build`'s server, which fetches it in Node
(redirects followed); the build admits any host, as Dolly's site does for a session, and logs each
host once; its browser reaches only `dolly-build`. With `HTTPS_PROXY` or `HTTP_PROXY` set it runs
itself again with `NODE_USE_ENV_PROXY`, without which Node 22.22 ignores them (measured with a
local proxy). The snapshot leaves the page as a FileReader's data URL; the build page checks for
memory64 first. `npm run image` keeps the catalog to its pinned sources (the site's release
reproduces). `docs/embedding.md` and `docs/dollyfile.md` say it, with a CI section.
`test/npm-browser.mjs`'s python-data recipe pip installs a wheel from the test's index (no CORS
headers, one redirect) and builds again through a proxy `HTTP_PROXY` names. Left: that test on
the reconcile round's packages.

What was found:

Two faults pinned the build between browser versions: one needs an old
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
no switch at all; a recipe's ordinary steps, `pip install x y z` among them, should work as they
do in a session. A recipe still grants itself nothing: the builder, the build's embedding, does.

Done when a test builds, with `dolly-build` in Playwright's Chromium and in Firefox and no browser
flags, a recipe whose `SLOP pip install` takes a package from a local index that sends no CORS
headers and redirects once, once directly and once through a local proxy that `HTTPS_PROXY` names; a recipe with `SLOP pip install` of PyPI packages builds by hand
(recorded here); one build in the oldest versions the docs name succeeds (by hand, recorded
here); and the docs say all of it.
