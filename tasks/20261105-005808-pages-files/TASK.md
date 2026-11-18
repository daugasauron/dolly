# Pages' 20,000 files for v0.1.6 beside every published version

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: release,deployment

Cloudflare Pages takes 20,000 files a deployment, and every published version stays on the site
(`docs/deployment.md`). Found while fitting v0.1.5's header rules
(`tasks/20261105-003331-pages-rules`).

## Measured (2026-11-12)

The 0.1.6 domain site packaged today (`build/domain-releases/0d27c879…`) is 3,988 files. Beside
v0.1.0 to v0.1.5 (18,683 with the root's four) it makes 22,671: v0.1.0 (2,277) and v0.1.1 (2,370)
leave at its deployment, which gives 18,024. Left: the deployment, when the owner asks for it.

## State (2026-11-07): the oldest versions leave the site

Owner (2026-11-07): "You can just remove older versions, start with 0.1.0 for the cloudflare
limit." The rule is in `docs/deployment.md`: when a new version does not fit, the oldest leave
first, one at a time until it fits, moved from the archive (`published/`) to `retired/` beside it,
and the release notes name them. Measured now: v0.1.0 to v0.1.5 are 18,683 files with the root's
four (v0.1.0 2,277, v0.1.1 2,370); v0.1.6, with the catalog's python-data, FFmpeg and OpenBLAS,
should need v0.1.0 and likely v0.1.1 retired. The shared pack store above is not pursued.

Done when: the 0.1.6 export fits with the fewest oldest versions retired, they are in
`work/locks/retired/`, the release notes say which left, and the deployed site 404s their paths.

## Measured, 2026-11-05

- The archive (`work/locks/published`, v0.1.0 to v0.1.4) is 14,042 files with each version's
  `deployment.sha256`. A v0.1.5 domain site is about 4,700 (2,292 packs and 396 of their parts,
  333 sources and 526 of their parts, about 1,150 pages, code and documents): about 18,750 in
  all. Another version of that size makes about 23,500, so v0.1.6 cannot be deployed beside all
  six as they are stored now, and the exporter will refuse it.
- Packs are most of it and repeat: the archive holds 6,429 pack files (with parts) at 3,064
  distinct paths, and 657 of v0.1.5's 2,292 packs are already in an older version, by hash.

## State, 2026-11-05

Open. A lever to measure: since v0.1.5 a page knows a split pack's manifest by its content, so a
pack needs no header rule wherever it is served; a version from v0.1.6 could read its packs from
one store the versions share (a `_redirects` rewrite of its `dist/packs/` costs one of 100
dynamic redirects, or the page's pack base), which counts each pack once. Versions now share
nothing by design (`docs/deployment.md`), so this changes that rule for packs, which are
content-addressed. Done when v0.1.0 to v0.1.6 export within 20,000 files and boot from a
locally served deployment.

## Closed (2026-11-16, the audit)

The done-when of 2026-11-07 holds. v0.1.6 was deployed with v0.1.0 to v0.1.3 retired, and v0.1.7
with v0.1.4 retired too: `work/locks/retired/` holds v0.1.0 to v0.1.4, `work/locks/published/`
v0.1.5 to v0.1.7. The v0.1.7 deployment is 15,092 files with 16 header rules
(`work/round1113/build/release-0.1.7-evidence/checklist.log`). v0.1.6's release notes say "v0.1.0 to
v0.1.3 are no longer online", v0.1.7's say the same of v0.1.4. On 2026-11-16 at 13:46 UTC,
`/v0.1.0/` and `/v0.1.3/` answered 404 on both domains. `/v0.1.4/` and
`/v0.1.4/default/` still answered 200 from Cloudflare's edge (`age` 45 h), while v0.1.4's other
paths answered 404. That leftover is filed as `tasks/20261116-135534-repo-03` (evidence in
`work/audit-1116-evidence/repo/live-retired-v014.txt`).
