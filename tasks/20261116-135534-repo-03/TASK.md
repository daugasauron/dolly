# A retired version's pages still answer 200 on both domains

- STATUS: OPEN
- PRIORITY: 230
- TAGS: audit,repo,deployment,bug,0.1.8

## State (2026-11-16)

Filed by the repo audit; nothing done. The cause is not confirmed.

## Found

v0.1.4 left the site with v0.1.7's first deployment (2026-11-15, 10:59 JST). On 2026-11-16 at
13:46 UTC, `https://slopshare.dev/v0.1.4/` and `/v0.1.4/default/` still answered 200, and so did the
same two paths on daugasauron.com. The body of `/v0.1.4/` was v0.1.4's own `index.html` (its MD5 equals
`work/locks/retired/v0.1.4/index.html`'s), with `cache-control: no-store`, `cf-cache-status: DYNAMIC`
and `age: 162321`: stored 45 h earlier, about 01:40 JST on 2026-11-15, while v0.1.6's deployment
still served v0.1.4. All 799 other page routes of v0.1.3 and v0.1.4 answered 404, and so did v0.1.4's
`index.html`, `llms.txt`, `page/version.mjs`, `dist/dolly-images.json` and `/v0.1.4/?x=1`. So a
visitor at v0.1.4's address gets its menu or its `default` page, and then every file that page asks
for answers 404.

Evidence: `work/audit-1116-evidence/repo/live-retired-v014.txt` and `live-retired-pagesdev.txt` (the headers of each path, on both
domains) and `live-retired-routes.txt` (the status of each of v0.1.3's and v0.1.4's 801 page routes on
slopshare.dev).

`docs/deployment.md` says: "Removing a version is the owner's explicit act: delete its directory
from the archive and deploy; its paths return 404". v0.1.7's release notes say "v0.1.4 is no longer
online". No step of a release checks this. `scripts/published-version.mjs boot` checks the
versions it is given, the root's redirect and one unversioned path (`:154`), and never a version
that left.

## Cause, narrowed and not confirmed

The deployment itself does not serve them. `https://9de166de.dolly-9dk.pages.dev/v0.1.4/` (v0.1.7's
second deployment) and `https://dolly-9dk.pages.dev/v0.1.4/` and `…/v0.1.4/default/` (the project's
own address) answer 404, while `…/v0.1.7/` there answers 200 (2026-11-16, about 14:30 UTC). So the 200 and
the `age` header come from the custom domains' own zone. Its cache kept the two responses although
they say `no-store`. To confirm, read both zones' cache rules in Cloudflare's dashboard (a "cache
everything" rule, for example), then purge `/v0.1.4/` and `/v0.1.4/default/` and request them
again.

## Do

- Remove the cause found above: a cache rule that ignores `no-store`, or a purge of each retired
  version's pages after the deployment that retires it.
- `published-version.mjs boot` also takes the retired versions (the `retired/` directory beside
  the archive) and checks that their `vX.Y.Z/` and `vX.Y.Z/default/` answer 404. Step 7 of the
  checklist then runs it.

## Done when

Every page of v0.1.0 to v0.1.4 answers 404 on both domains, measured. The live check of a release
fails while a retired version's page answers 200.
