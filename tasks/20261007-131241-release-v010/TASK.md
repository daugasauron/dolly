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
