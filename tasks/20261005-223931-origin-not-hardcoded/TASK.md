# Stop hard-coding daugasauron.com: the catalog origin as one setting

- STATUS: OPEN
- PRIORITY: 60
- TAGS: dollyfile,site,design,cleanup

## Implemented (2026-10-08, `core/versioned-recipes`)

The owner chose versioned recipe references (`20261007-131241-release-v010`),
and the integrator decided their form: a site path that starts with the
version, no domain. This is Dollyfile 7; the old form is not read.

    FROM https://daugasauron.com/Dollyfile-system-tools SHA256      (DOLLY 6)
    FROM /v0.1.0/Dollyfile-system-tools SHA256                      (DOLLY 7)

### Decisions made while implementing

- **Grammar.** A site path is `/vX.Y.Z/PATH`: three decimal numbers, a
  normalized path, no query. `FROM`, `INSTALL` and `COPY` take only a site
  path (a recipe on another host could never be built: the page supplies
  the artifact); `SOURCE` takes a site path or an absolute URL. Both
  parsers (`src/dollyfile-view.mjs`, `src/dollyfile.c`) read any version's
  path: the form is syntax, the version is resolution.
- **Resolution in the page.** `sitePath()` in `src/static-asset.mjs` is the
  one place: `/v<DOLLY_VERSION>/PATH` is `/PATH` among the page's own files,
  an absolute URL is `null`, any other path throws
  `/v0.2.0/…: this is Dolly 0.1.0, which reads only /v0.1.0/ paths` (both
  versions: one in the reference, one in the sentence). `siteReference(path)`
  writes the form. `CANONICAL_ORIGIN` and `canonicalPath` are gone.
- **A custom recipe** is checked before anything is built
  (`customRecipeGraph` in `src/image-build.mjs`): its `FROM`, `INSTALL` and
  `COPY` targets when they are read, its `SOURCE` rows explicitly, because
  the broker's refusal reaches a program only as an error number.
- **Inside Wasm.** The engine and `amy` hand the site path to the HTTP broker
  unchanged. The broker (`host/http/broker.mjs`) resolves this version's path
  against the site's root and refuses every other path with `EINVAL`. The
  engine does not know its version and needs none.
- **Bootstrap sources** (`host/http/policy.mjs`) are keyed by the URL the
  broker resolves a site path to, the file's public address
  (`publicURL(path)`), and still fetched from the release's own copy
  (`applicationBase`, under `_dolly/ID/` in an exported site). Consequence:
  the absolute URL of a published recipe or source on the page's own site
  is now the same exact, read-only, credential-free grant as its site path
  (before, only the `https://daugasauron.com/…` name was). The address of
  the release's copy still grants nothing.
- **Builders have a site** (`host/http/http.mjs`, `scripts/page-image-build.mjs`):
  a build reads its recipe and sources by site path. It grants nothing: the
  policy still judges the resolved URL.
- **`amy` knows its version at build time.** The index is
  `/v0.1.0/amy-index.txt`, so `amy` must write the version.
  `scripts/prepare-image-sources.sh` generates
  `dist/static/default/commands/version.h` from `package.json` and
  `Dollyfile-system-tools` stages it beside `amy.c`. Not chosen: a version
  file written at boot or `uname` (new platform interface), and reading
  `/etc/dolly/recipes.lock` (indirect).
- **The pin updater** rewrites the version segment of every site reference
  before it pins (`scripts/update-recipe-pins.mjs`): a version change is
  `package.json`, `src/version.mjs` and one run.
- **The lint** (`scripts/lint-dollyfiles.mjs`) refuses, by file and line,
  another version's path (sitePath's message), a `SOURCE` URL on the public
  site's origin, and (as a syntax error) a path without a version.
- **Dollyfile Studio's examples** take their `FROM` operands from the image's
  own `/etc/dolly/recipes.lock` (`demos/studio/install.slop`) instead of a
  written-out reference.
- **GitHub Pages' links to the domain** (`scripts/package-github-pages.mjs`)
  go to `PUBLIC_ORIGIN/v<version>/ROUTE/`, since the domain will serve
  nothing outside a version.

- **`curl` takes a site path** (`src/libcurl-fetch.c`): the adapter used to
  refuse every URL without a scheme, so `curl /v0.1.0/Dollyfile-system`
  failed as malformed. With no domain left to name the site's files, that
  was the only way from a shell to read the file a recipe names (Studio's
  skill and two tests fetched `https://daugasauron.com/…` for it), so the
  adapter now passes a path to the broker, which judges it. Found on the
  first chain build; it changes the `curl` package's source, not the seed.

### What remains of `daugasauron.com` (`git grep 'daugasauron\.com' -- ':!tasks'`)

| Where | Why |
| --- | --- |
| `src/static-asset.mjs`, `PUBLIC_ORIGIN` | the one setting: the lint's check and GitHub Pages' links to the domain |
| `README.md` | the link people open |
| `robots.txt` | cites the licences page; `/licences/` will not exist outside a version (the robots task's) |
| `docs/deployment.md` | the deployment document (the hosting step's) |
| `scripts/package-pages.sh`, `scripts/package-domain.mjs`, `sites/daugasauron.com/` | the domain site's name and its own pages |

No recipe, test, demo, generator or page module names the domain.

### Measurements (2026-10-08, one builder, 6 GB build slot)

- `npm run build:runtime`: 62.5 s; image inputs `c62b2710…` to `503e6ffe…`
  (the engine is in the seed): every image is rebuilt.
- First chain, 17 images (`default`, `system`, `amy`, `cc`, `git`,
  `javascript`, `audio-sdk`, `dolly-docs` and what they need): 12 min 41 s.
  `closed-source-agent` with `rust-sdk`, `rust-build`, `ripgrep`: 3 min 3 s.
- Second chain after the `curl` change (15 images from `curl` on, plus
  `python` and `gpu-sdk`; the seed and seven images before `curl` reused):
  8 min 7 s. 23 images in all.
- A version change on a copy of all 76 recipes written as `/v0.0.9/…`:
  `updateRecipePins` rewrote the 526 references and the pins in 0.2 s and
  the result was byte-identical to the tree.
- The three recipe generators (`gpu-fluid`, `slopyard`, `zero-ad`)
  reproduce their committed recipes without a difference.

### Verified (2026-10-08, commit `68626779` and the chain above)

Source: `node --test 'test/*.test.mjs' 'demos/**/*.test.mjs'` 417 pass;
`npm run -s lint:dollyfiles` 76 recipes; `test/dolly.artifacts.mjs` and the
demos' artifact tests 21 pass on the chain's registry.

Chromium 151 and Firefox 155, `node test/browser-tests.mjs chromium firefox`
(12 min 51 s): passed in both: amy (the first test: list, info, install
python, the record, a saved session), audio, boundary, composed toolchain,
core, cpp, custom session, default, display, docs, dso, ending, gpu
indicator, host compute, host modules, image, image inventory, indicators,
man and --help, network (after its fixture followed `curl`), process,
session without http, shell, shell environment, site, slop, snapshot
stream, startup script, terminal, threads, threads refusal, upload.

- `default` boots (core, default).
- `amy list`, `info`, `install git`, `install cc`, `installed` rows as
  `/v0.1.0/…`, and `curl` of this version's index; another version's and an
  unversioned path refused (`build/recipes-evidence/verify-amy.mjs`).
- The custom page's own template (`FROM /v0.1.0/Dollyfile-system …`) builds
  and runs; a recipe whose `FROM` or `SOURCE` names `/v987.0.21/…` is
  refused before a build with both versions in the message (custom session).
- Under the prefix `/pages/` the image boots, `amy` reads the prefixed index
  and `curl /v0.1.0/Dollyfile` returns the image's own recipe (site).
- An exported site's layout, emulated over the checkout server (assets only
  under `/_dolly/ID/`, pages with a `<base>`): `default` boots, `amy install
  git`, a recipe by site path comes from the release's copy, a custom recipe
  with a site-path `SOURCE` builds in the page, and nothing asks for a
  release asset at its public path
  (`build/recipes-evidence/verify-export-layout.mjs`).
- Demo tests: `javascript`, `python`, `closed-source-agent` in Chromium;
  `closed-source-agent` in Firefox.
- Studio is not built here: the two lines of its `install.slop` were run in
  a `system` session in both browsers, its lint ran from a copy of its
  staged files, and a source test now requires every module the lint and
  build commands import to be in its archive (`src/version.mjs` was missing).

Not run, and why:

- `amy programs` (the second test of `test/amy-browser.mjs`): needs `cmake`,
  `sdl2`, `rust` and `codex-cli`.
- `test/fs-growth-browser.mjs`: the 6 GB browser slot kills it in both
  browsers (`Memory cgroup out of memory` in the kernel log, Chrome at
  6.0 GB); not measured on `main` under the same cap.
- `test/gpu-render-browser.mjs` (needs a GPU display) and every demo test
  but the three above; `demos/llvm/test/stage2-browser.mjs` was edited and
  not run (`llvm-cc` is not built here).
- Packaging and release acceptance; the catalog beyond the 23 images.

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
