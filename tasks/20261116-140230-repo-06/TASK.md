# Deploying the showcase later: work/-only tooling, a menu link that 404s, a second packaging

- STATUS: OPEN
- PRIORITY: 200
- TAGS: audit,repo,release,deployment,0.1.8

## State (2026-11-19): fixed on `ws/release`, RC1's first half rehearsed; 0.1.8's release confirms it

The rule stays and is in the repository (the second of the two directions: the owner wants the
recordings made on the deployed site, `tasks/20261115-021459-videos-live`), `df6a9389a`:

- A version's first deployment has no showcase and no link to it: the release packages
  `package-pages.sh RELEASES` (no `slopshare.dev`), whose `index.html` keeps the `site-links`
  marker, and the checklist refuses a release with `agents/` there. Nothing is trimmed by hand.
- After the recordings are committed to `sites/slopshare.dev/agents/`: `package-pages.sh RELEASES
  slopshare.dev`, then `release-checklist.sh --showcase RELEASES ARCHIVE`, which checks that the
  commits since the tag change only `sites/slopshare.dev/agents/` and `tasks/`, the token scan, the
  seal, and assembles the deployment. `export-cloudflare-pages.mjs` takes a release of a version
  the archive holds only when its files outside `agents/`, `index.html` and `release/` are the
  archived ones byte for byte, `deployment.headers` and every part included, and it adds files
  under `agents/` alone, which the archived version had none of (`refuseChange`, unit-tested in
  `test/cloudflare-pages.test.mjs`). Then the deployment boots locally, and the printed steps
  deploy it, boot both domains, and `published-version.mjs verify SITE OUT vX.Y.Z ARCHIVE`
  fetches only the files the archived deployment's list lacks (for v0.1.7's showcase, the 89 of
  `agents/` and 4 of `release/`, instead of all 5,269), archive it in place of the first, push `main`, and edit the GitHub notes
  to the new list's digest.
- `docs/deployment.md` says the tag names the first deployment's commit and the version's
  `release/source.commit` the showcase's. The inline Python of `work/release-0.1.7*.sh` and the
  unmerged exporter are not needed.

Checked: `refuseChange` on v0.1.7's real lists (`work/round1113/build/pages-v0.1.7-core` against
`work/locks/published/v0.1.7`, 5,180 and 5,269 rows) accepts the showcase's addition and refuses
the same list a second time; `node --test test/cloudflare-pages.test.mjs` passes (6). The first
half rehearsed for RC1 on 2026-11-19 (`work/rc-release`, `tasks/20261116-140720-repo-07`): the
site packaged by `package-pages.sh RELEASES` alone, which step 3 found without `agents/`, and
its deployment beside v0.1.6 and v0.1.7, whose own files are 98 and 1.25 GB, the rest links to
the release and the archive (the 19 GB of parts 0.1.7's export wrote are now linked where a
published version holds them). The `--showcase` run needs the tag and the version in the
archive, so the release runs it first; its printed line names the releases directory it was
given (`445d47bc7`).

v0.1.6's link to `./agents/` stays, by the owner's decision on its removal ("Doesn't matter",
`tasks/20261115-115901-drop-v016`): it answers 404 while v0.1.6 is online. What only 0.1.8's
release confirms: its two deployments made by these commands alone, and its menu's link
answering 200 from the second on.

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
