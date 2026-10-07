# Versioned hosting and the release procedure for v0.1.0

- STATUS: OPEN
- PRIORITY: 310
- TAGS: release,deployment,hosting,plan

Owner (2026-10-07): "After claude works, I want to aim to release v0.1.0 of the
application. I also want the hosting to be backward compatible, so
daugasauron.com redirects to daugasauron.com/v0.1.0 (latest). And then when I
publish updates, I can just add a new version so the old ones are backward
compatible. I want a task to create a thorough plan for this."

## Owner's decisions

- 2026-10-07: "I want it to be completely backward compatible for now, just
  duplicate all static pages under the version (like /v0.1.0). It's not
  sustainable but it's good enough for now."
  So each version is a complete copy of its site under `/vX.Y.Z/`, and
  versions share nothing by design. This settles the layout in question 5
  and the mechanics in question 10 (one exported directory per version,
  side by side in one deployment), and it turns question 9 into a count:
  how many complete copies fit in 20,000 files (about eight at today's 2,317
  files) and what happens at the limit. The plan no longer weighs schemes
  that share HTML or assets between versions.
- 2026-10-07: "GitHub pages -> just best effort subset of latest relase
  (whatever fits). There should be no unversioned links, / should redirect
  to the latests version, like /v0.1.0. Saved sessions belong to a version."
  - GitHub Pages carries the newest version only, with as much of the
    catalog as fits in 1 GB; it promises nothing about older versions
    (question 11).
  - The domain serves nothing outside `/vX.Y.Z/` except the redirect at `/`
    (question 5). The plan lists what the host still needs at the root
    (`_headers`, `_redirects`, the 404 page, `robots.txt`) and says what
    today's public unversioned URLs return afterwards: 404 by this decision,
    unless the owner wants them redirected once.
  - It sharpens question 6: `https://daugasauron.com/Dollyfile-NAME SHA256`
    is itself an unversioned link, written in every recipe. Either recipes
    name versioned URLs (every pin changes at each release), or the URL stays
    a name that a version's page maps to its own copy and that nothing serves
    literally. The plan shows both on a real recipe and picks one.
  - Sessions are stored per origin today, so "belong to a version" needs the
    version in the session store's key: a version's pages list, restore and
    import only their own saves (question 8). The plan covers the image
    cache the same way, and what becomes of sessions saved on today's
    unversioned site.
- 2026-10-07: "regarding the versioning, go with 'Versioned recipe URLs'".
  Recipes name `https://daugasauron.com/vX.Y.Z/Dollyfile-NAME SHA256`: the
  URL a recipe writes is a file the site serves, and a Dollyfile written
  against 0.1.0 keeps resolving to 0.1.0's bytes. Question 6 is now how, and
  the plan works out:
  - what rewrites the version into every recipe at a release (an extension
    of `update-recipe-pins.mjs`?) and what recipes name between releases;
  - the cost: every recipe's text and so every pin changes at each release,
    and an image records its recipe, so measure whether a release rebuilds
    the whole catalog (about 80 minutes) or only re-seals it;
  - `CANONICAL_ORIGIN` and `canonicalPath` with a version in the path, on
    the domain and under GitHub Pages' prefix;
  - `amy-index.txt` and `amy install NAME` inside an old version;
  - recipes of one version that name another version's URL: allowed (the
    bytes are pinned) or refused.

Still open after these: archiving of published releases, the retention rule
at the file limit, security fixes to an old version, and migration.

## What this task delivers

The plan below, decided with the owner on 2026-10-07, and its steps.
Nothing is deployed under this task without the owner asking for the
release.

## What exists

- The site is static files, no server code ([deployment](../../docs/deployment.md)).
  A sealed release is `RELEASES/ID`, the ID a content hash. HTML is served
  no-store at checkout paths (`/`, `/xonotic/`, `/view/NAME/`); code, recipes
  and sources are immutable under `_dolly/ID/`; snapshot packs are immutable
  and content-addressed under `dist/packs/`, shared by every release that
  holds the same image bytes.
- daugasauron.com is the Cloudflare Pages project `dolly`. One
  `wrangler pages deploy` uploads a complete directory that becomes the site:
  at most 20,000 files, 25 MiB each (the exporter splits larger files into
  20 MiB parts). The deployment of 2026-10-07: 2,317 files, 18 GB; 1,507 were
  uploaded in 45 minutes, the 809 Cloudflare already held were not sent.
- `export:pages SITE OUT [PREDECESSOR…]` already carries the immutable assets
  of earlier releases, so a tab opened before a deploy keeps working, and it
  fails rather than drop one at the file limit. It does not carry their HTML:
  there is one set of routes, the newest. On 2026-10-07 the predecessor was
  no longer on disk and was left out.
- A path prefix already works: `export-static.mjs SITE OUT PREFIX/` (GitHub
  Pages serves under `/dolly/`; `test/site-browser.mjs` boots an image under
  `/pages/` with only the service worker for isolation).
- Recipes name each other as `https://daugasauron.com/PATH SHA256`
  (`CANONICAL_ORIGIN` in `src/static-asset.mjs` maps such a URL to the serving
  site's own file), and `amy` reads the site's `amy-index.txt`.
- Saved sessions, the image cache and the service worker belong to the
  origin, not to a path ([sessions](../../docs/sessions.md)): every version
  under daugasauron.com shares them.
- GitHub Pages replaces the whole site on each deploy and allows 1 GB; the
  site of 2026-10-07 is 963.6 MB. It cannot hold two versions.
- `package.json` says `0.0.0`; there is no `v*` tag and no changelog. The
  interface versions are other things: `DOLLY 6` recipes, host modules
  `NAME@0`, the process contract.
- A change to the seed (kernel, libc adapter, compiler, Slop, core tools)
  rebuilds every image, 26 GB of snapshots; a round that leaves it alone
  shares most packs with the round before.

## Plan

The owner (2026-10-07): "I think the answer to those questions should be
pretty clear by now... I want github tags to match releases." What follows is
decided; the two numbers marked *measure* are taken while implementing.

One name everywhere: version `X.Y.Z` in `package.json` = git tag `vX.Y.Z` =
GitHub release `vX.Y.Z` = site path `/vX.Y.Z/` = the prefix of every recipe
URL.

**Version and tags**

- `package.json` carries the version being developed. A release is a green
  round on a commit, the annotated tag `vX.Y.Z` on that commit, the GitHub
  release of the same name (notes, and the GitHub Pages tarball as its
  asset), then the deployments. The next commit moves `package.json` to the
  next version.
- The tag is the release: a packaged site records its source commit, and the
  release check compares it with `git rev-parse vX.Y.Z`. `pages-SHA-rN` tags
  are no longer made; `checkpoint-*` and `rc-*` stay local markers.
- While the version is 0.x: a patch release fixes, a minor release may change
  anything. The promise is that a published `/vX.Y.Z/` keeps serving its
  bytes while the site exists; nothing is promised about services outside
  the site (npm, model endpoints, git hosts) or about browsers.

**Recipe URLs**

- Recipes name `https://daugasauron.com/vX.Y.Z/PATH SHA256`. The canonical
  base becomes origin plus version, generated from `package.json`, behind the
  one constant `CANONICAL_ORIGIN` in `src/static-asset.mjs` that ten places
  use; `canonicalPath` strips it. `update-recipe-pins.mjs` writes the base
  into every recipe when the version changes, and the lint refuses a recipe
  in the tree that names another base.
- A version builds only from its own recipes: a URL of another version is
  refused with the message `src/image-build.mjs` already has. A Dollyfile
  written against 0.1.0 keeps working on `/v0.1.0/`, which is the
  compatibility asked for.
- Cost: a version change rewrites every recipe, and an image contains its
  recipe, so the round after the change rebuilds the whole catalog (about 80
  minutes; *measure*). That happens once per version, when `package.json`
  moves, not on release day.

**Site layout**

- A version is the complete site exported under its prefix, sharing nothing.
  `export-static.mjs` already takes a base (GitHub Pages' `/dolly/`); the
  Cloudflare exporter gains the same argument. Cloudflare stores identical
  files once, so repeated packs cost file slots, not upload time.
- The root holds only the redirect of `/` to the newest version (a Pages
  `_redirects` rule, 302), `_headers` (isolation for everything, immutable
  caching for each version's `_dolly/` and `dist/packs/`), `404.html` and
  `robots.txt`. Every other unversioned path returns 404, today's public
  links included.
- One deployment is the root files plus one directory per published version.
- `amy` reads `amy-index.txt` under its own version's prefix, as it already
  does under a prefix.

**Sessions**

- The session database's name carries the version (today the constant
  `dolly-sessions-v1` in `src/session-store.mjs`): a version lists, restores
  and imports only its own saves. An exported `.dolly-session` records its
  version, and another version refuses it, naming the version it belongs to.
- Sessions saved before 0.1.0 are not carried over: their images leave the
  site with the unversioned deployment. The release notes say so.
- The image cache is keyed by content digest and holds no user state; the
  versions share it.

**Capacity, archive, the limit**

- 2,317 files per version today, so eight versions fit in 20,000 files
  (*measure* on the first prefixed export). At the limit the exporter fails,
  and the owner removes a version explicitly; nothing is pruned
  automatically.
- Every published version is kept as its exported directory with its
  `deployment.sha256`, in one place outside `build/` (18 GB each today),
  because each deploy needs all of them. The live site is the second copy: a
  script mirrors `/vX.Y.Z/` back and checks it against that list, so another
  machine can redeploy.
- After a deploy: every file of the new version is checked on the live site
  against its list, and each older version's list is fetched and compared
  with the archived one.

**GitHub Pages**: the newest version only, at `/dolly/vX.Y.Z/`, with an
`index.html` at `/dolly/` that redirects to it; the catalog of
`config/github-pages-images.txt`, trimmed until the export is under 1 GB.
Its recipes name the domain's versioned URLs and resolve to its own files.

**Security**: a published version is never patched. A fix is a new version,
and `/` points to it. The owner may remove a version; its paths then return
404.

**What 0.1.0 needs**: `closed-source-agent` merged (in the domain's catalog
only once the owner has confirmed Anthropic's Commercial Terms); the
`robots.txt` task (`20261007-132428-robots`); the steps below; a green round
on the tagged commit. Every other open task ships as a documented gap.

## Steps

Tracked here, one round each; no further tasks are created for them.

1. The canonical base from `package.json`; recipes, documents and tests
   rewritten; the lint; `package.json` at 0.1.0. A full catalog round.
2. Sessions per version: store name, the version in the exported file, the
   refusal. Browser test: a save made under one version is not listed under
   another, and its export is refused there.
3. Exporters: the Cloudflare exporter takes a base and assembles the root
   files and the versions; the GitHub Pages redirect page. Test: two versions
   side by side in one export each boot their own image and install from
   their own index; an unversioned path returns 404; `/` redirects.
4. The release checklist as a script where it can be one; `pages.yml` takes
   the version tag; `docs/deployment.md` describes this instead of what it
   replaces.
5. `robots.txt`.
6. Release 0.1.0 by the checklist.

### Step 2, sessions per version (branch `core/versioned-hosting`)

- The store is `dolly-sessions-vX.Y.Z` (`src/session-store.mjs`, from
  `DOLLY_VERSION`). An exported file's metadata carries `version`;
  `importSessionFile` refuses another version's file with "This session file
  belongs to Dolly X.Y.Z…". A file without a version (exported before this)
  is refused as invalid metadata: nothing migrates. The store no longer reads
  the pre-0.1.0 records that held an `ArrayBuffer` instead of a `Blob`.
- The image cache, read in `src/image-artifact.mjs`: one database
  (`dolly-image-artifacts-v3`) for the origin, an entry keyed by
  `IMAGE_BUILD_ID:RECIPE_SHA256`, its bytes checked against their SHA-256
  when loaded, no user state. One thing was not as the plan assumed:
  `saveImageArtifact` deleted every entry of another runtime build, so a
  build under one version dropped the other version's cached custom images,
  and that version's saves on them then asked for a rebuild. Changed: a save
  replaces only this runtime's previous image in its slot; other runtimes'
  entries share the bound (32 images, 8 GiB, least recently saved first out).
- Cost of a merge: `Dollyfile-dolly-docs` pins `docs/sessions.md` and
  `docs/browser-boundary.md`, which this step edits, so `dolly-docs`, `pi`,
  `pi-local` and `dollyfile-studio` are re-pinned and rebuilt (385 s with
  two builders). The pins are not committed on this branch.
- Test: `test/site-browser.mjs` serves the checkout under `/vX.Y.Z/` and
  `/v0.0.0/` (the second with another version constant) on one origin; a save
  made under the first is not listed under the second, its exported file is
  refused there with the first's version in the message, and the first
  restores it. With both paths on one version constant the test fails at
  "another version lists the save". `test/core-browser.mjs` holds another
  runtime's cache entry through 33 saves.

### Step 3, exporters

Read on 2026-10-08:

- Cloudflare's documentation: 20,000 files a site (Free plan), 25 MiB a file;
  `_headers` 100 rules, 2,000 characters a line, one `*` a rule, `:name`
  matches one path segment and each name is used once in a rule;
  `_redirects` 2,000 static and 100 dynamic rules, 1,000 characters each,
  redirects are applied before headers and whether or not a file exists.
  Its asset server (`workers-sdk`, `rules-engine.ts`) turns each `:name` into
  its own capture group, so `/:version/_dolly/:release/…` is one valid rule.
- daugasauron.com as deployed (release `b06b5c8a…`): the rule
  `/_dolly/:release/Dollyfile*` (placeholder and splat) is in effect; a GET
  with `Accept-Encoding: identity` returns the stored bytes (a module, the
  kernel and a page hash to the sealed list); `X/index.html` and `X.html`
  answer 308 to `X/` and `X`; a missing asset is 404 with the 404 page;
  `/_headers` is not served, `deployment.sha256` and dotfiles are.

Decided while implementing:

- The version is never an argument: the exporters read it from the sealed
  release (`src/version.mjs`), so a site cannot be exported under a path its
  pages do not believe in. `export-static.mjs RELEASE OUT PREFIX/` writes
  `OUT/vX.Y.Z/` and a redirecting `OUT/index.html`;
  `export-cloudflare-pages.mjs ARCHIVE OUT [RELEASE]` assembles a deployment.
- `deploymentBase` refused a dot in a path, so `/v0.1.0/` was not a base; it
  now takes dots inside a segment and still refuses `.`, `..` and hidden
  segments.
- The archive is `published/` in the checkout a release is made from
  (ignored by git): `published/vX.Y.Z/` exactly as deployed, with
  `deployment.sha256` (every file) and `deployment.headers` (the headers its
  compressed and split files need, in `_headers` syntax, paths relative to
  the version). The exporter checks every archived file against its list and
  hard-links it into the deployment (no second copy of 18 GB a version);
  anything in the archive that is not a version, or a release whose version
  is already there, stops it.
- Root files: `_redirects` (`/ /vNEWEST/ 302`, one static rule), `_headers`,
  the newest version's `404.html`, and its `robots.txt` with each `Disallow`
  rule written once per version. No root list: each version carries its own.
- `_headers` within 100 rules: five fixed rules cover every version by
  placeholder (`/*` isolation and no-store; `/:version/_dolly/*` and
  `/:version/dist/packs/*` immutable; two `text/plain` rules for recipes).
  A compressed or split file needs a rule of its own. One rule
  (`/:version/_dolly/:release/PATH` or `/:version/dist/packs/HASH…`) serves
  it in every version when all versions that hold the file store it the same
  way; a file stored differently by two versions gets a rule per version.
  So rules grow with distinct large files, not with versions.
- The predecessor mechanism is gone: `retained` and
  `exportRetainedStaticAssets` in the exporters, `verifyRetainedRelease`, the
  multipart-support check for old releases, their tests, and in `serve.mjs`
  the lookup of older releases' packs and pinned paths.
- `npm run serve RELEASES` serves the current release under `/vX.Y.Z/`,
  redirects `/` there and answers 404 elsewhere; below the version it serves
  only what an export has there (pages, packs, `coi-serviceworker.js`,
  `robots.txt`, `amy-index.txt`, and everything under `_dolly/RELEASE/`).
- `scripts/published-version.mjs`: `mirror SITE vX.Y.Z ARCHIVE` (every file
  against the list the site serves), `verify SITE OUT vX.Y.Z` (after a
  deploy: every file of that version, every other version's list) and
  `boot SITE vX.Y.Z…` (real browsers). `test/pages-host.mjs` stands in for
  Pages locally: the documented rule syntax and the behaviour measured above.

Found by packaging, and fixed:

- `serve.mjs` importing from `site-release.mjs` made a module cycle through
  `accept-release.mjs`: `site-release.mjs accept` exited with an unsettled
  top-level await (status 13) and sealed nothing. The version is now read in
  `release-layout.mjs`, which imports nothing.
- `package-github-pages.mjs` linked the domain's applications at
  `https://daugasauron.com/IMAGE/`, which is 404 once nothing unversioned is
  served; it links `https://daugasauron.com/vX.Y.Z/IMAGE/`.

Measured on 2026-10-08, from the 76-image catalog of `main` `03a95b18`
(evidence in `work/hosting/build/hosting-evidence/`):

- **Domain catalog** (71 images with dependencies, `closed-source-agent`
  among them): sealed release 19,294,000,490 bytes in 18 min 21 s (41 images
  accepted; the 20 GiB scope ran at its cap in page cache and was not
  killed). Cloudflare deployment of the one version: **2,335 files**, 19.1 GB
  (570 packs, 714 parts, 190 pages, nothing over 25 MiB), plus the 4 root
  files; exported in 10 min 58 s, 6.3 GB of process memory at most, 38 GB of
  disk while it runs. **Eight versions fit in 20,000 files** (8 x 2,335 + 4 =
  18,684; the ninth makes 21,019).
- **Eight and nine**: eight hard-linked copies of that version, named
  `v0.1.0` to `v0.1.7`, assemble into one deployment of 18,684 files with
  the same 44 header rules (1 min 19 s, each copy checked against its
  list). With a ninth the exporter stops and writes nothing: "Pages'
  20,000-file limit exceeded by 1019: v0.1.0 has 2335 files, … v0.1.8 has
  2335 files; remove a published version explicitly".
- **Header rules**: 44 for one version: the 5 that cover every version, 28
  for large sources and the seed by path (4 Brotli, 24 in parts) and 11 for
  large packs by content hash. Versions that keep a file's path and storage
  share its rule, so a further version costs a rule only per large pack or
  source it changes; 56 rules remain, eight a version over seven more
  versions. This worktree's `dist/packs` holds the rounds since 2026-09-30:
  each added three packs over 25 MiB (two of 38 MiB, one of 31 MiB).
- **GitHub Pages catalog** (45 images with dependencies): sealed release
  961,512,839 bytes in 5 min 10 s; `export-static.mjs … /dolly/` gives
  `index.html` and `v0.1.0/`, 1,017 files, 963,736,637 bytes (36 MB under
  the limit). The same release as a Cloudflare deployment: 1,039 files, 13
  header rules.
- **Two versions in one deployment** (the GitHub catalog release, and a copy
  of it sealed again with `DOLLY_VERSION` 0.1.1), served by
  `test/pages-host.mjs`: 2,082 files, still 13 rules, `/` answers 302 to
  `/v0.1.1/`, `/default/` and `/amy-index.txt` are 404. In Chrome and
  Firefox `published-version.mjs boot` passes for both versions (each page's
  requests to the site stay under its own path and include its own
  `amy-index.txt`; a missing asset is 404). A save made under 0.1.0 is not
  listed under 0.1.1 and its exported file is refused there ("This session
  file belongs to Dolly 0.1.0…"), 0.1.0 restores it; the same the other way
  round; the browser holds `dolly-sessions-v0.1.0` and
  `dolly-sessions-v0.1.1`.
- **Mirror and verify**, against the same local host: `mirror` of 0.1.1
  gives a directory identical to the deployed one (1,039 files, 851,031,588
  bytes, with its Brotli-stored files and the pages a host redirects);
  with one bit of `v0.1.1/amy-index.txt` changed it stops, naming the file,
  and leaves nothing behind. `verify` of the one-version deployment names a
  pack part with one changed bit and passes again once it is restored;
  `verify` of the domain deployment reads its 2,335 files in 19 s.
- **Domain deployment in browsers** (local host): `default` boots in both;
  `rust-tools` boots from a pack stored in parts (one manifest with
  `X-Dolly-Parts` by the placeholder rule, two parts).
- **`npm run serve`** on the sealed GitHub release: `/` is 302 to
  `/v0.1.0/`, `/default/`, `/amy-index.txt` and `/v0.1.0/src/browser.mjs`
  are 404, `boot` passes in both browsers. The GitHub export served without
  isolation headers under `/dolly/`: `/dolly/` leads to `/dolly/v0.1.0/`
  and `default` boots isolated by the service worker in both browsers.
- Core browser suites in Chrome and Firefox: 37 suites pass in both;
  `fs-growth` fills more than 6 GiB by design and the 6 GB browser slot
  kills it in either browser (6.0 GB at the kill), so it did not run here.

Not settled here:

- A recipe URL `https://daugasauron.com/v0.1.0/Dollyfile-NAME` is not a file
  the deployment serves, as `https://daugasauron.com/Dollyfile-NAME` is not
  today (404): the bytes are at `/v0.1.0/_dolly/RELEASE/Dollyfile-NAME` and
  the version's pages map the URL to their own copy. If the owner's "the URL
  a recipe writes is a file the site serves" is meant literally, the
  exporter needs redirect rules per version (`_redirects` allows 100 with a
  splat) or a second copy of recipes and sources; to decide with the recipe
  reference form.
- Step 5: the root `robots.txt` is the newest version's with each
  `Disallow` written per version; its comment names
  `https://daugasauron.com/licences/`, which is 404 after this release.
- The placeholder rules were exercised on the local stand-in, written from
  Cloudflare's documentation and asset-server source; the first deployment's
  `boot` and `verify` are their first run on Pages itself.

### Step 4, checklist, workflow, document

- `scripts/release-checklist.sh DOMAIN_RELEASES GITHUB_RELEASES [ARCHIVE]`
  checks items 1 to 3, assembles the deployment of item 6 and prints the
  commands of items 4 to 8. It does not package (that is the round's job,
  under its memory cap): a site not sealed from HEAD stops it.
- `pages.yml` takes `release_tag` (`vX.Y.Z`) and the tarball's SHA-256,
  checks out `refs/tags/TAG`, and `site-release.mjs verify` holds the
  artifact's recorded commit and sources to that checkout; the export must
  produce `TAG/`. The `source_commit` input is gone.

## Release checklist

1. Round green on the commit (source, artifacts, browser suites in both
   browsers, demos, GPU tests); the tree clean.
2. Credential scan of the commits and of `dist/dolly-*-system.snapshot`.
3. Package the domain site and the GitHub Pages site; acceptance passes; the
   Pages workflow's steps pass locally, under 1 GB.
4. Tag `vX.Y.Z`; push `main` and the tag; the packaged sites' recorded
   commit equals the tag's.
5. GitHub release `vX.Y.Z` with notes and the tarball; run `pages.yml`.
6. Assemble the deployment from the archive and the new version; deploy as a
   detached job; never restart it.
7. Live checks in Chromium and Firefox: `/` redirects; the new version boots
   `default` and runs a command; each older version still boots; the file
   lists match.
8. Archive the new version's export; move `package.json` to the next
   version.

## Done when

- The steps are done and 0.1.0 is released by the checklist, with the
  evidence of each check recorded here.

## Related

`20261007-085236-claude-code-image` (to finish first), `docs/deployment.md`,
`docs/browser-boundary.md`, the 19:30 entry of `20261005-132713-round-1005`.
