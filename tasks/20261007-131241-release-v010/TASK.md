# Plan release v0.1.0 and versioned hosting where every published version stays reachable

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

A plan written into this file, which the owner approves section by section,
and the implementation tasks it creates. Nothing is implemented or deployed
under this task.

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

## Questions the plan answers

Release v0.1.0:

1. What the version names (the distribution: runtime, catalog and site
   together?), where it is recorded (`package.json`, a tag, the pages, a file
   in each image) and how it relates to the interface versions above.
2. Release criteria: the open tasks that block 0.1.0, by ID from `tatr ls`;
   the known gaps that ship documented; each site's catalog; the licence
   gates (the Claude Code image needs the owner's confirmation of Anthropic's
   Commercial Terms; Xonotic's two points that the archives cannot settle).
3. The release procedure as a checklist with times from measured rounds:
   round, checks, tag, notes, the GitHub release, both deployments, the live
   verification.
4. The policy after 0.1.0: what makes a patch, a minor and a major version,
   and what "backward compatible" promises and for how long.

Versioned hosting:

5. URL layout: `/v0.1.0/…` for everything a version serves. What `/` does,
   what the unversioned links already public do (`/xonotic/`, `/view/NAME/`,
   `/Dollyfile-NAME`, `/amy-index.txt`, `/licences/`), and whether there is a
   `/latest/`. How the redirect is made with static files only (a Pages
   `_redirects` rule or an HTML page), its caching, its effect under
   COOP/COEP, and proof that no rule shadows `/vX.Y.Z/`, `/_dolly/` or
   `/dist/packs/`.
6. Canonical recipe URLs, the interface question. Recipes pin
   `https://daugasauron.com/Dollyfile-NAME SHA256`. Decide between versioned
   URLs, unversioned URLs whose hash selects the bytes, or both; show each
   option on a real recipe, and say what an old image's `amy install` and a
   custom Dollyfile written against 0.1.0 resolve to once 0.2.0 is out.
7. What keeps working for an old version, as statements a test can check: its
   pages boot the same image bytes; its recipes, sources and documents are
   served unchanged; `amy` installs from its own index; a session saved on it
   restores on it; an exported `.dolly-session` imports; a custom image
   rebuilds. And what is not promised: services outside the site (npm, model
   endpoints, git hosts), and browsers that change.
8. State shared by all versions on the origin: saved sessions, the image
   cache, the service worker's scope, `robots.txt`, `404.html`. What a newer
   page does with an older version's session, and whether the session list
   names the version.
9. Capacity and retention, measured, not estimated: the files and bytes one
   more version adds when the seed did not change and when it did; how many
   versions fit in 20,000 files; the upload time; the local disk needed to
   keep every published release (the exporter needs each on disk). A
   retention rule under which no version disappears silently, and whether a
   second host or one Pages project per version is needed, with what that
   does to the origin and so to sessions.
10. Mechanics: how one deployment is assembled from all versions (extending
    the predecessor mechanism to carry HTML under a prefix, or one exported
    directory per version); where published releases are archived so another
    machine can redeploy them (they are not in git); and how a published
    version is shown unchanged after later deploys (its live files against
    its sealed manifest).
11. GitHub Pages: the newest version only, or a redirect to the domain.
12. Security. An old version keeps its old runtime and broker. The policy
    for a flaw found later: withdraw the version, patch it in place (which
    ends immutability), or mark it and redirect; and who decides.
13. Migration: the first versioned deploy, starting from the release live
    today (`b06b5c8a…`) and the links already public.

## Done when

- Each question has a recommendation, the alternatives rejected with the
  reason, and for question 9 numbers measured on real exports.
- The decisions that are the owner's are listed first, each with the default
  the plan proceeds on.
- The first release is a step list with a verification per step, and the
  implementation is split into tasks small enough for one round each.

## Related

`20261007-085236-claude-code-image` (to finish first), `docs/deployment.md`,
`docs/browser-boundary.md`, the 19:30 entry of `20261005-132713-round-1005`.
