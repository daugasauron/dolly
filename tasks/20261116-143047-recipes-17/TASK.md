# Three docs say amy reads its index through the HTTP broker; it comes over packages@0, and a policy needs no rule for it

- STATUS: OPEN
- PRIORITY: 100
- TAGS: audit,amy,docs,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`).

## State (2026-11-17)

Done on `cleanup/0.1.8`, except the browser runs. The three documents say the page's own
directory's index comes from `packages@0` and another directory's goes through the broker, under
a rule. `amy-browser` drops `indexRule` (its "amy" and "amy refusal" policies; the "amy" one
keeps `/mirror/`) and `nena-browser` its index rule. Checked without `dist/`: `node --check` of
both tests, `platform-documents.test.mjs` after re-pinning `dolly-docs`, `lint:dollyfiles`.

Left: `node test/amy-browser.mjs` and `node test/nena-browser.mjs` on a built `dist/` (none in
this tree). Eleven demos' browser tests (`git grep amy-index.txt demos/`) add the same rule, and
`pi-browser`'s comment says a page "admits the package index itself"; they are outside this
task's list and unchecked.

## Found

For the page's own image directory `amy` asks `packages@0` for the index
(`programs/commands/amy.c`, `channel_text(DOLLY_PACKAGES_KIND_INDEX, ...)`), and the transport
fetches `amy-index.txt` itself (`host/packages/transport.mjs:78-83`), outside the HTTP policy. A page
whose policy has no rule for the index (only a POST rule for another path) lists and installs:

```
$ amy list | head -1
airtime-godot    -         Airtime: Foundry in Godot, ...
$ curl -s -o /dev/null -w '%{http_code}\n' $(amy server)amy-index.txt      # the broker refuses the same URL
000                                                                         (curl status 9)
```

Three documents say otherwise:

- `docs/dollyfile.md:357-360`: "`amy` reads the server's `amy-index.txt` through the HTTP broker".
- `docs/http.md:91-95`: "so `amy` reads its site's `amy-index.txt`; an embedding with a policy that
  wants `amy list` adds `{ origin: location.origin, path: "/amy-index.txt" }`".
- `docs/browser-boundary.md:166-167`: "The index of package names is not the service's: it is the
  site's public `amy-index.txt`, an ordinary request under the HTTP policy", while the same
  paragraph's start (lines 151-154) and the `packages@0` row say the mailbox hands it over.

`test/amy-browser.mjs:78-79` ("What a restricted page adds for amy: its own site's index") and
`test/nena-browser.mjs:88` add that rule to their policies for nothing. Only another directory
(`amy server URL`) reads its index through the broker.

Evidence: `work/audit-1116-evidence/recipes/noindex.jsonl` (case `noindex`, the policy without the
rule: `NOINDEX=1` in `scripts/amy-each.mjs`).

## Do

Say in the three places that the page's own directory's index comes over `packages@0` and that a
policy's rule matters only for a directory `amy server` names; drop the index rule from the two
tests' policies (amy-browser's foreign-directory steps keep their `/mirror/` rule).

## Done when

The docs say one thing, and `amy-browser` and `nena-browser` pass without the index rule.
