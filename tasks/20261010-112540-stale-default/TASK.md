# daugasauron.com/default/ still answers 200 from Cloudflare's edge

- STATUS: OPEN
- PRIORITY: 120
- TAGS: hosting,cloudflare

Owner (2026-10-10): "the \"unversioned paths\" should give 404... its just
stupid that they would give 200?"

## Measured (2026-10-10, 02:24 UTC, from this machine, edge `NRT`)

- The deployment answers 404 for unversioned paths: on its own address
  (`9e9a1bb5.dolly-9dk.pages.dev/default/`) and on daugasauron.com for
  `/default`, `/default/index.html`, `/default/?x=1`, `/xonotic/`,
  `/classicube/`, `/pi/`, `/codex/`, `/Dollyfile-system`,
  `/dist/dolly.wasm`, `/src/browser.mjs` and a path that never existed.
- One exact URL answers 200: `https://daugasauron.com/default/`. The body is
  the page of the deployment of 2026-10-07 (it names `_dolly/b06b5c8a…`),
  the response carries `age: 230001` (2.7 days) and `cf-cache-status:
  DYNAMIC`, and a request with `Cache-Control: no-cache` gets it too. Its
  own files are 404, so the page is broken, not usable.
- After v0.1.0, `/xonotic/` answered 200 the same way; it is 404 now.

So this is not the deployment and not the zone's CDN cache: it is a copy
that Cloudflare Pages keeps per data centre, keyed by the exact URL, of
something an earlier deployment served. The integrator's recollection, not
verified here, is that Pages documents this as preserving a previous
deployment's assets for up to a week. The release tasks said "Cloudflare
Pages keeps serving files of earlier deployments for paths the new one
lacks": right in kind, wrong in extent (one URL, not the unversioned paths).

## What removes it

- Waiting: if the week is right, it ends about 2026-10-14.
- A purge of that URL in the Cloudflare dashboard (zone daugasauron.com,
  Caching, Configuration, Custom Purge, URL). Not tried: this machine has
  no credential for the zone's cache (wrangler's login is for Pages).
- Not taken: a redirect rule for `/default/` would win over the kept copy,
  but the owner decided there are no unversioned links.

Done when `https://daugasauron.com/default/` is 404 and
`node scripts/published-version.mjs boot https://daugasauron.com v0.1.0
v0.1.1` passes.
