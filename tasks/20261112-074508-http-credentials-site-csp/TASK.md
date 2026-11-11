# HTTP: a hardened rule names the headers that may leave; the public site sends a Content-Security-Policy

- STATUS: OPEN
- PRIORITY: 200
- TAGS: http,security,site,audit

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, S5; 2026-11-07 F5, F12).

## State (2026-11-12)

Filed.

## Do

- Under a hardened rule, credential stripping is a list of six names (`host/http/policy.mjs:7-14`):
  a token in `PRIVATE-TOKEN`, `X-Auth-Token` or a query string leaves to any admitted origin. Invert
  it: a hardened rule names the request headers that may leave. The default policy is unchanged.
- The site's pages run under the strict policy `docs/embedding.md` gives since `4d05b19dd`: the
  Pages export sends it (`scripts/export-cloudflare-pages.mjs`), and the local release server too.

## Done when

`test/http-policy.test.mjs` covers an unlisted credential header under a hardened rule, and the
site's routes boot under the header with zero violations (`test/csp-browser.mjs` against a release).
