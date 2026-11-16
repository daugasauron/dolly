# packages@0 reads a guest-named image directory outside the HTTP policy: 15 files no rule admits, with the page origin's cookies

- STATUS: OPEN
- PRIORITY: 300
- TAGS: audit,core,security,http,packages,0.1.8

From the core audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`). The redesign that would remove the path is `20261104-143110-modules-r5` (a foreign
directory over packages@0's own channel, each URL admitted); that task waits on an owner decision
about `http@0` in `default`, and this is a reproduced bypass of the policy now, so it is its own.

## State (2026-11-17)

Fixed on `fix/packages-policy` (`fdfea7188`, from main `b09b1e243`), not merged. The package
Worker asks the page before each read of another directory (`admit` in `host/http/http.mjs` now
returns the rule; `host/packages/service.mjs` answers and ends a refused transfer with 403, the
policy's reason in the body) and reads with `judgedFetch` (`host/packages/worker.mjs`): no
credentials or referrer, the body within the rule's `maxResponseBytes`, each wait within its
timeout. The catalog and metadata are fetched as JSON through it (`directoryJSON`,
`page/images.mjs`), the packs and their parts too (`page/packaged-snapshot.mjs`); the page's own
directory is read as before. The review map and `docs/dollyfile.md` say so.

Test: `test/amy-browser.mjs` "amy another directory" (a rule for `/exact/` alone; a `/mirror/`
prefix with a cookie on the page's origin; `maxRequests: 2`). Before the fix, Chrome and Firefox
(`work/audit-1116-evidence/core/fix-core06/before-*.log`, failing at the first assertion; the
scratch runner showed all three): 502 with a request reaching `/exact/`, 15 mirror reads each
with the cookie, 200 under the quota after 15 requests. After: 403 with nothing requested under
`/exact/`, the install with no cookie, 403 after 2 requests; all of `amy-browser.mjs` passes in
both (`after-*.log`), so do http-refusals, network, boundary, session-without-http (and image
in Chrome, the page's own reads of its packs), the review map's node checks
(41/41) and `validate-browser`; `npm run test:source` 463/471, the 8 failures being `build/`
fixtures a source-only tree lacks (17/17 with round1113's linked in).

Left: merge with a round: the two documents' pins changed `Dollyfile-dolly-docs` and 12 demo
recipes (the pi chain, classicube, rts, slopyard, studio), which need rebuilding; the code
needs none. Not done, as beyond the broker's behaviour: a fixed byte bound on the JSON (the
default policy's `maxResponseBytes` is unbounded); a relayed origin is fetched directly, not
through its relay; a size or timeout failure answers 502 with the browser's message, a
metadata file's as "snapshot is missing"; a foreign directory's packs are still kept in the
origin's store (`modules-r5`).

## Found

AGENTS.md: "`env.dolly_http_dispatch` is the sole intentional agent-selected network edge.
Destination, credential, redirect, quota, and approval policy belongs to its browser-side provider
and must remain enforceable after complete Wasm compromise." The review map
(`docs/browser-boundary.md:158-162`): another directory's snapshot is "read only where the page's
HTTP policy admits a GET of its URL, counted and shown as the guest's request".

`host/packages/service.mjs:53` asks the policy about the directory's URL once
(`this.admit(directory)`); the package Worker (`worker.mjs:12-16`) then reads, with the
browser's own `fetch` and JSON module imports, `DIRECTORY/dist/dolly-images.json`, the metadata
of the package and of every image it is built on, and its packs
(`page/packaged-snapshot.mjs:46,175`). None of those URLs is judged by the policy, counted
against its `maxRequests`, bounded by the rule's `maxResponseBytes` or timed by its timeout; the
two JSON files have no byte bound at all.

Reproduction (`work/audit-1116-evidence/core/probes/foreign-directory-probe.mjs`, log
`foreign-directory-probe.log`): `work/round1113` served twice, A the page (`default`), B a second
directory; the page's policy is `{ rules: [{ origin: B, path: "/", methods: ["GET"] }] }`, which
admits exactly `GET B/`.

- `curl -fsS B/dist/dolly-images.json` in the guest: exit 9, and B received no request: the
  policy refuses it.
- `curl -fsS 'https://packages.dolly.invalid/v1/packages/<less's pin>/from/<B/, encoded>'`:
  exit 0, 683,993 bytes of `less`'s snapshot, and B served 15 files the policy admits none of:
  `/dist/dolly-images.json`, 13 `dist/dolly-*-system-snapshot.json` (system-build, zlib, gzip,
  curl, git, zig-build, libdolly-display, libdolly-input, ghostty-build, display, system-tools,
  mandoc, less) and one `dist/packs/*.snapshot.gz`.

So under a hardened policy the guest reaches paths of an admitted origin that no rule admits, and
15 requests count as one. The URLs are fixed suffixes of the admitted directory and carry no
guest bytes beyond the directory itself, so this widens destinations within an origin and the
quota, not what the guest can send. They differ from the broker in credentials too: the broker
fetches with `credentials: "omit"` (`host/http/broker.mjs:298`), these reads with `"same-origin"`
(`page/packaged-snapshot.mjs:174`, and JSON module imports default to it), so a directory the
guest names on the page's own origin is read with that origin's cookies. Reproduced in Chrome
(`same-origin-cookie-probe.mjs`, `same-origin-cookie-probe.log`; default policy, a cookie
`probe` set on the page's origin, the test server serving the catalog again under `/other/`):
`curl` of `/other/dist/dolly-images.json` through the broker arrived with no Cookie header; the
package request for `/other/` arrived as the same 15 reads, each with `probe=page-cookie`. The
packs are also kept in the origin's store and never pruned (`modules-r5`'s State).

## Do

Judge every URL the package Worker reads by the page's policy, as the guest's own requests are:
the service hands the Worker a fetch that calls `admit` (and counts) for each URL, or the Worker
asks the service before each fetch; a refusal ends the transfer with 403 and the refusal notice.
Give the catalog and metadata reads a byte bound (`DOLLY_SNAPSHOT_*` or the metadata limit the
page uses for its own directory) and read a foreign directory with `credentials: "omit"`, as the
broker does. Correct the review map's sentence to say each file is judged.

## Done when

The probe's package request fails (403) under that policy and B receives at most the requests the
policy admits; with a rule admitting B's whole directory (`pathPrefix`), the install works and
each file counts against `maxRequests`; the cookie probe's 15 reads arrive without the cookie; a
case in `test/amy-browser.mjs` or `network-browser.mjs` checks these in Chromium and Firefox.
