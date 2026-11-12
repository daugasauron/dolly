# HTTP: a hardened rule names the headers that may leave; the public site sends a Content-Security-Policy

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: http,security,site,audit,0.1.6

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, S5; 2026-11-07 F5, F12).

## State (2026-11-12)

Both done on `fix/batch`: under a hardened rule only an ordinary request's headers and those the
rule names leave (`2e0bde0b3`, `host/http/policy.mjs`; the default policy is unchanged), and the
site sends a Content-Security-Policy, the sessions and custom pages without inline script
(`2c69b3a4a`). In the batch round: `test/http-policy.test.mjs` ("a hardened rule lets through
only the credential headers it names") passes, and `test/csp-browser.mjs` in Chromium and
Firefox against the checkout. Tests whose rules sent other headers name them now
(`fix/round-1112`). Left: `test/csp-browser.mjs` against the release the round packages
(`127.0.0.1:9045`).

## Do

- Under a hardened rule, credential stripping is a list of six names (`host/http/policy.mjs:7-14`):
  a token in `PRIVATE-TOKEN`, `X-Auth-Token` or a query string leaves to any admitted origin. Invert
  it: a hardened rule names the request headers that may leave. The default policy is unchanged.
- The site's pages run under the strict policy `docs/embedding.md` gives since `4d05b19dd`: the
  Pages export sends it (`scripts/export-cloudflare-pages.mjs`), and the local release server too.

## Done when

`test/http-policy.test.mjs` covers an unlisted credential header under a hardened rule, and the
site's routes boot under the header with zero violations (`test/csp-browser.mjs` against a release).

## Closed (2026-11-13)

Both on main (`2b8036055`). `test/http-policy.test.mjs` ("a hardened rule lets through only the
credential headers it names") passes in the source suite of the batch round. The release 0.1.6
packaged from main (`973b3ad4…`), served by main's `scripts/serve.mjs` on 127.0.0.1:9045, sends the
site's policy on every route; the menu, `default/`, `sessions/`, `view/default/`, `licences/`,
`python-data/` and `godot-airtime/` each reach their ready state in Chrome and Firefox with no
violation reported (`securitypolicyviolation` and the console, Workers included).
