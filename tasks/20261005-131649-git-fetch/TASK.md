# git cannot fetch: github.com is unreachable through the browser broker

- STATUS: OPEN
- PRIORITY: 270
- TAGS: network,git,design

`~/Downloads/AUDIT-sandbox-painpoints.md` §1, §2 (inside the deployed `pi` image, 2026-10-03):

```
$ git clone --depth 1 https://github.com/daugasauron/dolly.git d
fatal: unable to access '…': Browser HTTP transport failed
```

Reachable: `raw.githubusercontent.com`, `api.github.com`, `cdn.jsdelivr.net`,
`registry.npmjs.org`. Not reachable ("broker could not connect"): `github.com`,
`codeload.github.com`, `objects.githubusercontent.com`, `example.com`. The
likely cause is that those hosts send no CORS headers and the broker is the
page's `fetch`; verify in a browser. Every failure prints the same line, so an
agent cannot tell a policy refusal from a host the browser cannot reach.

## Decide

The constraint stands: one explicit, restrictable broker and no path around it.
Options: document only; a git remote helper over `api.github.com`; a relay the
embedding configures as provider policy, still behind `dolly_http_dispatch`.

## Done when

- The cause is verified and the decision recorded here.
- curl and git name the class of failure the broker knows (refused by policy,
  blocked or unreachable in the browser).
- The Pi skill says what works (`20261005-130240-pi-skills`).
