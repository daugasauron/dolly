# A page with a strict Content-Security-Policy: html@0's popups need 'unsafe-inline'

- STATUS: OPEN
- PRIORITY: 345
- TAGS: html,npm,boundary,0.1.6

The owner, 2026-11-11 07:15 JST, deploying a page built on the npm packages:

> The HTML show stuff has some bug with CSP, I had to add some unsafe flag to make it work. The
> agent that tried to deploy it said that the security model used doesn't work, something about
> parent/child inherited CSP blocks the content of HTML unless the parent is marked "unsafe".

## State (2026-11-11)

Fixed on `fix/npm-feedback`, measured, not yet run from packed packages:

- html@0's popup is a srcdoc frame sandboxed without `allow-scripts` (`allow-same-origin
  allow-forms`): the page parses the document with DOMParser and copies the allowlist into it,
  adopts its style sheet and takes a form's fields from its submit event. A frame loaded from a
  file of the module was measured first and refused: under `coi-serviceworker.js`'s isolation a
  sandboxed frame's navigation bypasses the worker and is blocked (Chrome, Firefox), and Data Pi
  is hosted that way. `test/html-browser.mjs` now checks that a script put into the popup does
  not run (it fails with `allow-scripts`).
- The site's route pages load `src/route.mjs` and `src/route.css`; boot() and the host modules
  adopt style sheets; the servers send `.css` as `text/css`.
- Process Workers and their local modules stay `blob:` URLs (a program starts without a request),
  so the policy keeps `blob:` in `script-src` and `worker-src`; WebAssembly needs
  `'wasm-unsafe-eval'`. `docs/embedding.md` gives the policy; `test/csp-browser.mjs` boots system
  with html under it, answers a popup, offers a download and opens the upload dialog with no
  violation (Chrome, Firefox).
- `dolly-build init`'s page and Data Pi's are `index.html`, `page.css` and `main.mjs`.

Left: `test/npm-browser.mjs` on the reconcile round's packages, which builds a project from
init's page.

Done when a browser test (Chrome, Firefox) serves a booted image and a popup (`html` and a form
answer) under that strict policy and both work, with the policy's violations counted at zero.
