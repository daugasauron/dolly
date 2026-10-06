# Stop hard-coding daugasauron.com: the catalog origin as one setting

- STATUS: OPEN
- PRIORITY: 60
- TAGS: dollyfile,site,design,cleanup

Owner request (2026-10-06, low priority): "the HOST should be an environment
variable or something, never hardcode daugasauron.com. … Dollyfiles always
contain daugasauron.com, even when a release candidate is deployed locally. On
local releases the Dollyfiles should be like localhost:9005/… (I think that
makes sense?)"

## Today (main `15aefe12`)

- Recipes name every image, package and staged source by full URL on one
  canonical origin: 405 mentions of `daugasauron.com` in the 61 recipes. The
  origin is one constant, `CANONICAL_ORIGIN` in `src/static-asset.mjs`; four
  scripts, 15 test files and the demo fixtures repeat the literal.
- Every site (the domain, GitHub Pages, `npm run serve`, the test server)
  serves its own copy of those files and maps canonical URLs to itself, so a
  locally served release builds from local bytes while its recipes still say
  `https://daugasauron.com/…`. That was chosen in `20260930-230823-full-urls`
  so that recipe text, pins and image identity are the same on every host.

## The trade-off to settle first

A pin is the SHA-256 of the recipe text, and pins cascade into image identity.

- Writing the serving host into recipes (`http://localhost:9005/…` locally)
  changes every recipe's bytes per host: the same image gets a different
  identity locally and deployed, a candidate verified locally is not
  byte-identical to what ships, and a Dollyfile saved from one site does not
  rebuild on another (the shareable-recipe story of
  `20261005-223022-studio-video`).
- Recommended instead: recipes name the catalog origin symbolically (one
  word or variable that both parsers resolve to the site serving the
  release; DOLLY 4's `HOST` did this for `USE`), external hosts stay full
  URLs, and the origin a release is published under is one setting read at
  packaging time. Recipe bytes and pins are then identical everywhere, the
  recipe views on a local release link locally, and no source file contains
  `daugasauron.com` except that setting and the site's own pages.
- Cost of the symbolic form: a saved Dollyfile rebuilds on any site that
  publishes the same pinned files, and fails by name where one is missing;
  it no longer says where the catalog lives. Record the owner's choice here.

## Owner's direction (2026-10-06)

"Maybe it's better to revert to URL/HOST as before, or better to imply that if
the domain is omitted in the dollyfile reference it will try to fetch from the
site it's deployed at? Should work for localhost as well?"

Recommended form, the second: a reference is either an absolute URL (another
site, through the HTTP policy) or an absolute path, which means the site
serving this release:

    FROM /Dollyfile-system SHA256
    INSTALL /demos/python/Dollyfile-python SHA256
    SOURCE /dist/static/default/slop.c SHA256 /tmp/slop/slop.c

No keyword is needed (DOLLY 4's `USE HOST …` took two words, which Dollyfile 6
removed), the text and pins are the same on every host, and it works on
localhost and under GitHub Pages' path prefix because the page already
resolves its own files that way. The package index and `amy installed` rows
take the same form.

## Done when

- The owner's choice is recorded; `git grep daugasauron.com` finds only the
  one setting and the domain site's own content; recipes, views and
  `amy installed` rows show the chosen form; a release served on another
  port or host builds, installs and passes the browser suites unchanged.

Changes every recipe (a new Dollyfile revision if the form changes): its own
rebuild round.

## First use (2026-10-06, `work/amy-index`)

The HTTP broker now takes the recommended form for a request: a URL that is
a path names a file of the site serving the release (`host/http/broker.mjs`,
`docs/http.md`), and `amy` asks for `/amy-index.txt` with no domain. Recipes,
the index rows and `amy installed` still carry `https://daugasauron.com/…`.
