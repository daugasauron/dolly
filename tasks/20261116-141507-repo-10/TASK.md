# The exporter and the live check keep code for versions before v0.1.5, which the site no longer serves

- STATUS: CLOSED
- PRIORITY: 50
- TAGS: audit,repo,cleanup,deployment,0.1.8

## Closed (2026-11-17)

On `cleanup/0.1.8`: `partsRule` and its branch are gone from the exporter (a file no rule names
is stored as it is), `catalogStaticSources` reads only `dist/dolly-images.json`, and
`cloudflare-pages.test.mjs` publishes no `X-Dolly-Parts` rule (a file in parts now gets no rule,
which it asserts). `page/static-asset.mjs` loses the comment and its `headers.delete("x-dolly-parts")`,
which only a pre-v0.1.5 rule could make necessary, with the test that labelled a manifest.
`docs/deployment.md` states the rule without the old pages and gives 0.1.7's export (15,092 files,
16 rules) for the measurement of v0.1.0 to v0.1.4.

Checked: `git grep -n "before v0.1.5"` finds nothing outside `tasks/`; `node --test
test/cloudflare-pages.test.mjs test/static-asset.test.mjs test/http-broker.test.mjs` passes (32);
`pagesHeaders` over `work/locks/published/` (v0.1.5 to v0.1.7) gives 15,088 version files (with the
root's four, 15,092) and a `_headers` byte-identical to the one before the change and to
`work/round1113/build/pages-v0.1.7/_headers` (16 rules). The exporter's file list is untouched.
`http-broker.test.mjs` keeps its remote response labelled `x-dolly-parts`: it shows a remote
manifest is never expanded, whatever its headers.

## Found

Since v0.1.7's deployment, the archive of published versions (`work/locks/published/`) holds v0.1.5,
v0.1.6 and v0.1.7. v0.1.0 to v0.1.4 are in `work/locks/retired/`, where `docs/deployment.md` moves
a version that leaves the site. Code that exists only for those older versions:

- `scripts/export-cloudflare-pages.mjs:65-67`, `partsRule`: "the rule pages before v0.1.5 need for a
  file in parts". It also takes the `partsRule` branch at `:102` and the comment at `:106-108`. No
  archived version's `deployment.headers` names `X-Dolly-Parts`: 0 lines in each of v0.1.5, v0.1.6
  and v0.1.7, against 43 in the retired v0.1.4. So the exporter never writes such a rule now.
- `scripts/published-version.mjs:107-111` and `:181`: `catalogStaticSources` reads
  `dist/dolly-images.mjs`, "the module that held them before v0.1.5", when the version is older than
  v0.1.5.
- `test/cloudflare-pages.test.mjs:38-39` (`partsHeaders`) and the archive case at `:86-88` that
  publishes a v0.1.0 with that rule, which test the branch above.
- Comments that describe the old pages: `page/static-asset.mjs:61` and `test/static-asset.test.mjs:9`.
- `docs/deployment.md:123-125`, the rule "one before v0.1.5 also for each file in parts
  (`X-Dolly-Parts`)", and `:128-134`, the measurement of 2026-11-02 on the archive of v0.1.0 to
  v0.1.4 (v0.1.4's 3,785 files and 55 rules, the five versions' 92). Both describe versions the site
  no longer serves. 0.1.7's export is the current number: 15,092 files, 16 rules.

`firstWithPolicy = "v0.1.6"` (`export-cloudflare-pages.mjs:72`) still serves v0.1.5, which is online.
It goes when v0.1.5 leaves.

## Do

Remove the branches, their tests and the two comments. If a retired version were ever put back in
the archive, its `deployment.headers` would still name its rules, which the exporter copies like
any other. Only the `/:version` merge that `partsRule` allows would be lost.

## Done when

`git grep -n "before v0.1.5"` finds nothing outside `tasks/`. `node --test
test/cloudflare-pages.test.mjs` passes, and the export of v0.1.5 to v0.1.7 is the same file list and
`_headers` as 0.1.7's (`work/round1113/build/release-0.1.7-evidence/checklist.log`: 15,092 files,
16 rules).
