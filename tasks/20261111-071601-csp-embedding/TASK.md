# A page with a strict Content-Security-Policy: html@0's popups need 'unsafe-inline'

- STATUS: OPEN
- PRIORITY: 345
- TAGS: html,npm,boundary,0.1.6

The owner, 2026-11-11 07:15 JST, deploying a page built on the npm packages:

> The HTML show stuff has some bug with CSP, I had to add some unsafe flag to make it work. The
> agent that tried to deploy it said that the security model used doesn't work, something about
> parent/child inherited CSP blocks the content of HTML unless the parent is marked "unsafe".

## State (2026-11-11)

Cause found, not fixed. html@0's popup is `<iframe sandbox="allow-scripts allow-forms"
srcdoc=…>` (`host/html/html.mjs`, `frameSource`): the frame's own `<meta>` policy allows only its
nonce, but an srcdoc document also inherits its parent's policy (CSP 3, local-scheme documents),
and both apply. Under the embedding page's `script-src 'self'` the frame's inline script, which
builds the popup, is refused, so the popup stays empty until the page allows `'unsafe-inline'`,
which weakens the whole page. Dolly's tests never serve a page with a `script-src`, so nothing
saw it (`local-llm-browser.mjs` sets `connect-src` only).

The popup's containment holds (opaque origin, no network, no navigation of other pages); what
fails is that it only works under a permissive parent. Fix, decided:

- The frame loads a document of the html package's own (a file beside `html.mjs`) instead of
  `srcdoc`: a document from a URL keeps its own policy and inherits none. Its script is fixed
  (the popup's source, theme and font arrive by `postMessage`), allowed by its hash in its own
  `<meta>` policy; the sandbox stays as it is. The parent needs `frame-src 'self'` at most.
- The same audit for everything else a page runs: process workers `import()` local modules
  from `blob:` URLs (`src/process-worker.mjs`), which `script-src 'self'` refuses too, and
  WebAssembly needs `'wasm-unsafe-eval'`. Find each by the test below, remove what can load from
  the package's own files instead, and list what remains.
- `docs/embedding.md` states the policy an embedding can serve (no `'unsafe-inline'`, no
  `'unsafe-eval'`), and `docs/browser-boundary.md` the popup frame's change.

Done when a browser test (Chrome, Firefox) serves a booted image and a popup (`html` and a form
answer) under that strict policy and both work, with the policy's violations counted at zero.
