# Deploying the showcase later: work/-only tooling, a menu link that 404s, a second packaging

- STATUS: OPEN
- PRIORITY: 200
- TAGS: audit,repo,release,deployment,0.1.8

## State (2026-11-16)

Filed by the repo audit; nothing done. The choice between the two directions below is the owner's.

## Found

`docs/deployment.md` allows one addition to a published version: it "may first be deployed without
its `/agents/` showcase, which a later deployment of the same version adds, so that its recordings
can show the published site". That deployment "changes no other file of the version but the
release's own lists". The last two releases both went this way. v0.1.6's showcase was never added
(`tasks/20261115-115901-drop-v016`). v0.1.7 was deployed twice, at 10:59 and 14:16 on 2026-11-15
(`work/round1113/build/release-0.1.7.log`).

Nothing in the repository makes such a deployment:
- The core is the checklist's deployment with `v0.1.7/agents/` deleted, and `deployment.sha256` is
  trimmed by an inline Python script (`work/release-0.1.7.sh:86-95`).
- Part 2 packaged the site again (31 min, 13:35 to 14:06, after the disk filled at 13:33). It
  exported with an unmerged branch's exporter (`work/pagesfix/scripts/export-cloudflare-pages.mjs`)
  and `work/dedupe.py`. It checked that the core's files were unchanged with 25 more lines of
  inline Python (`work/release-0.1.7-part2.sh:47-66`), then deployed, booted, and verified every
  file live a second time (49 min, 14:22 to 15:11). All of v0.1.7 was fetched again for 89 new
  files. With the 1 h 20 min of recording on the published site before it, the second deployment
  was 3 h 5 min of the release's 13 h 31 min (`tasks/20261116-140603-buildtime-00`).
- Part 2 ran no step of the checklist. It pushed `main` with the four commits since the tag
  (`work/release-0.1.7-part2-resume.sh:85`) without step 2's scan of the commits to push for
  token-shaped strings.

The tag no longer names what is served. `docs/deployment.md` opens with "A release is a version
`X.Y.Z` (…): the git tag `vX.Y.Z`, the GitHub release of that name and the site path `/vX.Y.Z/`". The tag
`v0.1.7` is `8a99bb4ea`, while the deployed version's `release/source.commit`
(`work/locks/published/v0.1.7/`) is `b09b1e243`: 4 commits and 16 files later (the showcase and its
tasks).

The rule itself publishes a broken link. `scripts/package-domain.mjs` adds the showcase and its
link in the menu (`<a href="./agents/">Demo videos →</a>`) in one step. The core keeps the menu
and drops the directory, and the rule forbids changing the menu later. So
`https://slopshare.dev/v0.1.6/` links to `/v0.1.6/agents/`, which answers 404 on both domains (measured
2026-11-16). `work/locks/published/v0.1.6/index.html` has the link and no `agents/` directory beside
it. v0.1.7's menu linked to a 404 for the 3 h 17 min between its two deployments.

## Do

One of these two:
- Drop the rule. A release's recordings are made on the candidate served as it will be deployed
  (`npm run serve`, `test/pages-host.mjs`), and the version is deployed once, with its showcase.
- Keep the rule and put it in the repository. `package-pages.sh` seals a release without the
  showcase's directory and link, and the later deployment may also change the version's root
  `index.html`, a page that is never cached. `export-cloudflare-pages.mjs` checks that nothing
  else differs from the archived version. The inline scripts in `work/` go, and
  `docs/deployment.md` says that the tag names the core and `release/source.commit` names the
  showcase's commit.

## Done when

The next release's deployments are made by scripts in the repository alone, and no published
menu links to a path that answers 404.
