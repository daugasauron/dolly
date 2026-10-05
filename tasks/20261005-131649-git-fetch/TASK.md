# git cannot fetch: github.com is unreachable through the browser broker

- STATUS: CLOSED
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

## Status (2026-10-06)

Open for two things that are not this branch's: the owner's decision on the
relay, and the Pi skill saying what works (`20261005-130240-pi-skills`). The
cause, the class messages and the statuses are done and tested (`efa9f7b1`;
`node test/network-browser.mjs chromium` and `firefox` pass on image inputs
`1c081c54…`). In Chrome against the real network
(`build/audit-core-evidence/probe-default-seed1.log`):

```
$ git ls-remote https://github.com/daugasauron/dolly.git; echo rc=$?
fatal: unable to access 'https://github.com/daugasauron/dolly.git/': Browser could not fetch the URL: blocked (no CORS headers, or a redirect) or unreachable (DNS, TLS, offline)
rc=128
$ curl -sS https://example.com/; echo rc=$?
curl: (7) Browser could not fetch the URL: blocked (no CORS headers, or a redirect) or unreachable (DNS, TLS, offline)
rc=7
$ curl -sS -o /dev/null -w %{http_code} https://api.github.com/repos/daugasauron/dolly
200
```

## Decision (2026-10-06, delegated by the owner; `fix/git-fetch`)

**A relay is provider policy: the embedding maps an origin to a relay in the
browser-side broker (`DOLLY_HTTP_RELAYS`), and Git stays unchanged and
unconfigured. There is no transport over a forge's REST API. The public sites
configure no relay: there `git clone` from `github.com` fails within a second
with the "could not fetch" line, and an agent takes a snapshot of the files
through the hosts that grant CORS.**

This replaces the earlier recommendation in one point: the mapping lives in
the provider, not in Git's `insteadOf` inside the guest.

### What was measured

No relay, GitHub's CORS-granting hosts (`build/git-fetch-evidence/`):

- A prototype (`measure-no-relay.mjs`, 75 lines) rebuilt a shallow commit from
  `api.github.com` (one commit, one recursive tree listing) and
  `raw.githubusercontent.com` (one request per file), and compared every
  object id with Git's. For `daugasauron/dolly`: 2 API calls, 1,305 file
  requests, 73.8 MB, 20.9 s natively; all 431 trees and 1,305 blobs exact.
- The commit id is the weak point. The API normalises dates to UTC, so the
  commit object can only be found by trying every UTC offset (about 20,000
  SHA-1 candidates). That rebuilt the exact id for `daugasauron/dolly` and
  `git/git`, and failed for `cli/cli` (a signed merge) and `torvalds/linux`:
  2 of 4.
- `torvalds/linux`: the listing is truncated (71,638 entries), so a large
  repository needs a request per directory, against a limit of 60
  unauthenticated API requests an hour per address.
- It cannot give history, `fetch`, `push`, private repositories or any other
  forge. As a Git remote helper it would be about 500 lines of C for one
  company's REST API (JSON, SHA-1 search, loose objects, the helper protocol).
- The same requests with ordinary commands in Chrome on the `default` image
  (`snapshot-in-browser.log`): `curl` twice, `awk`, then `xargs -P 8 … curl`
  fetched the 1,305 files in 58.7 s; `git init && git add -A && git commit`
  took 2.2 s and `git status` was clean. The executable bit of 39 files is
  not represented, so this tree's id differs from upstream's.

A relay (`relayed-clone.log`, `public-site-clone.log`), Chrome, `default`
image, default policy, unchanged Git:

```
$ git clone --depth 1 https://github.com/octocat/Hello-World        # no relay: 0.4 s
fatal: unable to access 'https://github.com/octocat/Hello-World/': Browser could not fetch the URL: blocked (no CORS headers, or a redirect) or unreachable (DNS, TLS, offline)
$ git clone https://github.com/octocat/Hello-World                  # origin mapped to a relay: 2.1 s
Receiving objects: 100% (13/13), done.
$ git log --oneline | head -1; git config remote.origin.url; git fsck --full; git fetch origin
7fd1a60 Merge pull request #6 from Spaceghost/patch-1
https://github.com/octocat/Hello-World
```

The relay in that measurement was isomorphic-git's public `cors-proxy`, used
once for a 13-object repository to show that an existing implementation of
the URL shape serves; nothing ships pointing at it.

### Reasons, by `AGENTS.md`

- "Network access crosses one explicit, restrictable browser broker" and
  "Destination, credential, redirect, quota, and approval policy belongs to
  its browser-side provider and must remain enforceable after complete Wasm
  compromise": a destination mapping is destination policy. In the provider
  the embedding fixes it before Wasm runs; the guest cannot set, read or
  bend it; rules keep naming the real destination (`github.com`, methods,
  path prefix), so a relay admits nothing; and the broker withholds every
  credential header the mapping does not name. As `insteadOf` in the guest
  the relay would have to be an allowed destination that a compromised guest
  could address directly, for any upstream the relay serves.
- "Prefer unchanged upstream source plus target/toolchain configuration over
  source forks and per-program compatibility patches": with the mapping,
  upstream Git needs nothing, and curl, Python and Janis get the same host
  for free.
- "Report unsupported capabilities accurately … an unimplemented operation
  cannot return success": a REST helper would let `git clone` succeed with a
  depth-1 imitation that cannot fetch or push and whose commit id is wrong in
  half the repositories tried. A snapshot the agent asked for by name is
  honest; a clone that is not one is not.
- "Every line of code is a maintenance burden": the mapping is about 50 lines
  of provider code; the helper is about 500 lines of host-specific C.
- "Do not broaden browser authority merely to make a port pass … no path
  around the HTTP broker": the mapping adds no import, no destination and no
  default. It moves trust to a relay only where an embedding chooses one,
  and `docs/browser-boundary.md` says so.
- "No new remote service" (the owner's instruction for the public sites): they
  are static files, so they get no relay and say so. A user-facing setting
  for one is a separate decision.

### Implemented

- `host/http/policy.mjs`, `host/http/broker.mjs`: `DOLLY_HTTP_RELAYS`, consumed
  and deleted with the policy. An admitted request for a mapped origin is
  fetched from `through` + host + path + query, without redirects, with only
  the credential headers the mapping names, and the program is told the URL
  it asked for. Page JavaScript only: image inputs are unchanged (`047fc328…`).
- `docs/http.md` ("CORS and relays": configuration, guarantees, relay
  protocol, what the public sites do), `docs/browser-boundary.md` (the trust
  it moves).
- `demos/pi/skills/dolly/SKILL.md`: try `git clone` once; without a relay take
  a snapshot and, if needed, `git init` it; say that it has no upstream.
- Tests: `test/http-policy.test.mjs` and `test/http-broker.test.mjs` (mapping,
  credential removal, no redirect, inherited policies, rejected
  configurations); `test/network-browser.mjs` in Chrome and Firefox: unchanged
  Git clones, fetches and shallow-clones a forge origin the browser never
  contacts, through a same-origin fixture relay with an allowlist; the relay
  receives no `Authorization`; a URL the policy refuses never reaches it;
  an unmapped host without CORS still fails with status 7.

### Left

- Operating a relay and enabling it for the public sites: not done, by the
  owner's instruction. It needs a host that runs code, and a decision on
  whose traffic it carries.
- A setting by which the person at the page names a relay of their own: not
  built; it is page UI and a trust prompt, not policy plumbing.
- Relayed requests follow no redirect, so a renamed repository fails through
  a relay that passes the forge's redirect on instead of answering itself.
