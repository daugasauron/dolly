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

## Review note (2026-10-05, `20261005-131642-big-picture`)

`docs/sources.md` lists Git "HTTP clone/fetch/push" as a core port and the
thesis is "the tools that coding agents actually need", so "document only"
leaves the first command an agent tries failing on the public site. A remote
helper over `api.github.com` is a per-host work-alike, which the porting
rules argue against. The design already has the fitting shape: the embedding
sets policy next to `DOLLY_HTTP_POLICY`, and `docs/http.md` describes a
reviewed same-origin relay as "one more allowed destination". Recommended: a
relay as embedding configuration (an exact upstream allowlist, the broker
unchanged), and the public site decides whether it runs one. Running a relay
is an operating cost and an authority the owner must accept: owner decision.

Read in code: a policy refusal already prints differently from a transport
failure (`src/libcurl-fetch.c:346-352`: `EACCES` -> access denied,
`ETIMEDOUT` -> timed out, everything else -> "could not connect"). What cannot
be told apart is CORS, DNS and a host that is down, because Fetch hides it;
the message can say so.

## Findings (2026-10-05, `fix/audit-core`)

The cause is CORS, verified twice.

- From the build host, with `Origin: https://daugasauron.com`
  (`build/audit-core-evidence/cors-probe.log`): every destination answers 200,
  and the audit's "reachable" column is exactly the hosts that grant the origin.

  | Destination | `access-control-allow-origin` |
  | --- | --- |
  | `api.github.com`, `raw.githubusercontent.com`, `cdn.jsdelivr.net`, `registry.npmjs.org` | `*` |
  | `github.com/…/info/refs?service=git-upload-pack` | none |
  | `codeload.github.com` | `https://render.githubusercontent.com` only |
  | `example.com` | none |
  | `gitlab.com`, `codeberg.org` Git endpoints | none |

  So `github.com` is reachable and the browser withholds its response from the
  page; no common forge serves Git smart HTTP with CORS headers.
- In Chrome and Firefox (`test/network-browser.mjs`): the test server, asked
  under a second origin name that sends no CORS headers, receives the request
  and `curl` still fails. Fetch reports only a `TypeError`, so the broker
  cannot tell this from DNS, TLS or a host that is down.

## Done here

- The transport error names its class in every client
  (`dolly_http_error_message`, `host/http/http.h`): "Browser could not fetch
  the URL: blocked (no CORS headers, or a redirect) or unreachable (DNS, TLS,
  offline)". Git prints it after `fatal: unable to access`. A policy refusal
  keeps its own line ("Browser HTTP policy denied the request").
- `curl` exits with curl's own status, so a script can tell the classes apart:
  7 could not fetch, 9 refused by policy, 28 deadline, 22 HTTP error with
  `-f`; `curl --help` says so and that a URL needs CORS headers.
- `docs/http.md` states the class and that `github.com` needs a relay.
- Tested in `test/network-browser.mjs` (statuses 7 and 9; Git prints the same
  class line as curl for each).

## Decision

Recommended: **a relay as embedding configuration**; the broker and Git stay
as they are. Owner decision, because it is an operating cost and an authority.

- Shape: a reviewed HTTP relay on the page's own origin (or one exact allowed
  origin) that forwards only Git smart-HTTP fetch requests, `GET
  …/info/refs?service=git-upload-pack` and `POST …/git-upload-pack`, to an
  exact upstream allowlist, and adds CORS headers. The default policy already
  admits the page's origin; a restricted embedding adds one rule. Nothing
  leaves `dolly_http_dispatch`.
- Git finds it through its own configuration, written by the embedding's image
  into `/etc/gitconfig`: `[url "https://ORIGIN/git/github.com/"] insteadOf =
  https://github.com/`. Upstream Git is unchanged and `git clone
  https://github.com/…` works as typed.
- Limits to set in the relay, not in Dolly: no `git-receive-pack` and no
  `Authorization` forwarding (a token must never cross a third party, as
  `docs/http.md` says of public CORS proxies), a response cap, a rate limit. It
  is then a public read-only proxy to the allowlisted forges and costs their
  clone bandwidth.
- Not done tonight: it needs server code on the deployed origin (the public
  site is static) and the owner's acceptance of that authority.

Rejected:

- Document only: Git over HTTP is a core port and cloning is the first thing an
  agent tries. It is what this batch ships (class messages, statuses, docs),
  not the end state.
- A remote helper over `api.github.com`: a per-host work-alike that speaks a
  REST API, not Git (no packs, no history without a request per object, 60
  unauthenticated requests an hour). The porting rules prefer unchanged
  upstream.
- A `no-cors` probe in the broker to tell "blocked" from "unreachable": it
  would hand a compromised userspace a reachability oracle for hosts the page
  may not read (a LAN scanner) and double the requests of every failure.

For the Pi skill (`20261005-130240-pi-skills`): what works without a relay is
single files from `raw.githubusercontent.com` and `cdn.jsdelivr.net/gh/`, and
metadata and trees from `api.github.com`; `git clone`, `fetch` and `ls-remote`
from `github.com`, `gitlab.com` and `codeberg.org` fail with the "could not
fetch" line, as do `codeload.github.com` archives.
