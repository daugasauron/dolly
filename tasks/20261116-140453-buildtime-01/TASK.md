# A version bump rebuilds all 230 images: 5 h 49 min of 0.1.7's release for five images' change

- STATUS: OPEN
- PRIORITY: 300
- TAGS: audit,build,release,0.1.8

From the build-time audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`). Evidence and the scripts that produced it: `work/audit-1116-evidence/buildtime/`.

## State (2026-11-17)

Fixed on `ws/versionless` (`95ba9c87e` and the commits after it), choice (2), with the owner's
word of 2026-11-17 ("Yes fix it, need to upgrade dollyfile syntax? Thats fine I want to improve
it"). Open only for what the 0.1.8 compiler round alone can confirm (below).

### Design: DOLLY 8, a site path without the version

A recipe names a file of the site as `/PATH` (`FROM /Dollyfile-system SHA256`,
`SOURCE /dist/static/default/slop.c SHA256 /tmp/slop.c`); `DOLLY 7` wrote `/vX.Y.Z/PATH`. The
page resolves the path among its own files, as `sitePath` already did after removing the
prefix; the pin says which bytes a row means. Nothing else of the language changed.

Reasons:

- The version in the path named nothing the pin does not name better. A page reads only its
  own files, so the prefix could only equal the page's version or be refused; it selected
  nothing, and it cost a new text and pin for every recipe at every release.
- Identity follows content: a recipe that did not change is the same bytes, the same pin and
  the same image in every version, in a build, in the browser's image cache (one database per
  origin) and in the packs a deployment uploads.
- Less code: the prefix, its refusal ("this is Dolly X, which reads only /vX/ paths") in the
  page, the lint and the custom page, and the rewriting of locations in
  `update-recipe-pins.mjs` are gone; no mechanism was added.
- `DOLLY 8`, not a silent change of `DOLLY 7`: the reference grammar changed, as it did when
  `DOLLY 7` introduced site paths (`7dadd7093`), and a `DOLLY 7` recipe is refused by its first
  line instead of failing on a file `/v0.1.7/…` that no site has.

Considered and not taken:

- Bumping early within the old form (choice 1): a fix release still rebuilds 230 images.
- Naming an image by its name (`FROM system SHA256`): the engine, the broker and the custom
  page would need a catalog to turn a name into a file; a path is already the name of a
  published file, and works for an unpublished checkout and for sources.
- A relative path without the leading `/`: nothing gained, and the first byte no longer tells
  a site path from a URL for the broker.
- Keeping `/vX.Y.Z/` in the text and ignoring it for identity: two texts for one recipe, and
  the pin would no longer be the SHA-256 of the bytes.

Consequences accepted: a published version keeps its own page, engine and recipes and is
untouched; `http@0`'s contract is the same Wasm (the URL a guest may pass is `/FILE`, a
comment); a 0.1.8 page asked for `/v0.1.7/FILE` answers 404 where 0.1.7 answered `EINVAL` for
another version; sessions stay bound to their version (`session-store.mjs`, unchanged); an
npm project's recipe needs its first line and its site `SOURCE` rows edited once
(`docs/npm-upgrading.md`), and from then on only its pins move.

The version itself: `page/version.mjs` is the one place that holds it. `package.json` (private)
has no version; `package-npm.mjs`, `release-checklist.sh` and the npm test read `version.mjs`;
`test/version.test.mjs` is removed. A bump is that one line.

Two sources no longer carry the version: NetSurf's `site:` scheme passes `/FILE`
(`curl-dolly.h`, no generated `version.h`), and the Studio's tar has no `page/version.mjs`
(`static-asset.mjs` no longer imports it).

### Approved on this evidence (2026-11-17, `work/versionless`)

- `tasks/20261116-140453-buildtime-01/convert-dolly8.mjs`: 275 files converted (230 recipes,
  the recipes tests and tools write, the Studio's examples), 230 recipes pinned; a second run
  converts 0. `npm run -s lint:dollyfiles`: 230 recipes.
- `npm run test:source`: every test passes but `dist/dolly-abi.json holds what the generated
  modules give the browser`, which fails in this tree before the change too (its `dist/` is
  0.1.7's until `build:runtime`; it passes after it). The parser test runs the C engine and the
  JavaScript parser over the same cases, the new reference forms among them.
- `npm run build:runtime`, then `DOLLY_BUILD_IMAGES=system,default npm run image`: the 30
  images of that closure built from the seed with the DOLLY 8 engine, `system-build`,
  `zig-build`, `ghostty-build`, `system` and `default` among them (2,358 s beside other builds).
- `tasks/20261116-140453-buildtime-01/bump-proof.sh 0.1.8` (plan, move the version, pin, build
  the runtime, lint, plan):

  ```text
  files the bump changed:
     M page/version.mjs
  image inputs before: sha256:81f854f7e2f6b5425d9253f23e6da0c1bf1fca9b14ba6691de072667cc0fca1a
  image inputs after:  sha256:81f854f7e2f6b5425d9253f23e6da0c1bf1fca9b14ba6691de072667cc0fca1a
  plan: 30 reuse, 200 build of 230 images
  plan after the bump: identical to the plan before it
  ```

  The 30 are the images built in this tree; the 200 are 0.1.7's, which the seed's change
  rebuilds whatever the version is ("seed or image ABI changed", and x11-libs, which the tree
  lacks). No recipe, pin or image input changed with the version, where 0.1.7's bump changed
  230 recipes.
- Chrome and Firefox against those 30 images, the machine at a load of 20 to 40 from the other
  workstreams: `test/image-browser.mjs` (custom recipes `FROM /Dollyfile-system`, a grandchild
  chain, the image cache), `test/boundary-browser.mjs` (`curl /PATH` of a granted source) and
  `test/core-browser.mjs` pass in both. `test/custom-session-browser.mjs` passes in both
  (196 s, 199 s) with its 30 s page timeout lengthened for the load, its new case among them:
  a recipe that names `/v0.1.7/Dollyfile-system` is refused before anything is built, naming
  the path. `test/amy-browser.mjs` passes up to its first package outside the 30 (`amy info
  curl` prints `INSTALL /Dollyfile-curl PIN`; `amy install cc` installs `/Dollyfile-cc`) and
  `test/site-browser.mjs` stops at a document of `dolly-docs`: both need the whole catalog.

### Which images this rebuilds

All 230, once: every recipe's text and pin changed, and `programs/dollyfile.c` is in the seed
(image inputs `87c27243…` to `81f854f7…`). 0.1.8's round is a compiler round and rebuilds them
anyway.

### What the 0.1.8 round must confirm

- The compiler round's fixed point with the DOLLY 8 engine in the seed, and all 230 images
  built from DOLLY 8 rows.
- In Chrome and Firefox on the full catalog: `demos/wine/test/wine-browser.mjs` (NetSurf's
  `site:/` without the version), `demos/studio/test/studio-browser.mjs` (the Studio's lint and
  `curl /PATH` without `page/version.mjs`), `test/npm-browser.mjs` (the packager and
  `dolly-build` on `version.mjs`), and `published-version.mjs boot` of the candidate beside
  v0.1.5 to v0.1.7.
- After the round, `bump-proof.sh 0.1.9` in the round's tree prints `230 reuse, 0 build` and
  "identical": then close this task and remove `convert-dolly8.mjs` and `bump-proof.sh`.

For the integrator: after merging the other workstreams run
`node tasks/20261116-140453-buildtime-01/convert-dolly8.mjs` (it converts what they added and
pins; a second run converts nothing), then `--sources` pins for changed sources as usual. A
script that read `require('./package.json').version` reads `page/version.mjs` now.
`pin-seed-compiler.mjs` still writes the version into the seed compiler's URL; the fixed-point
check that trips on it is `tasks/20261116-140017-repo-01`'s.

## Found (2026-11-16)

- `scripts/update-recipe-pins.mjs` "writes this version into every site reference, then the pins"
  (lines 11-12, 51-53). Every recipe names the site's files as `/vX.Y.Z/PATH`
  (`docs/dollyfile.md:49-56`), so a bump changes the bytes of every recipe and so every
  `FROM`/`INSTALL`/`USE`/`COPY` pin, which is the SHA-256 of the recipe it names. An image's
  identity compares its recipes' locations and digests (`inspectSnapshot` in
  `scripts/build-system-snapshot.mjs`, `recipeRecords` in `scripts/dollyfile-graph.mjs`, whose
  `sourcePath` carries the version), and the image retains its recipes' text.
- 0.1.7's round (`build/round-1117.log`, plan in `round-1117-evidence/catalog-1.log` of
  `work/round1113`): the version commit `653727235` at 01:37, the round at 01:40. The plan built
  all 230: 227 "recipe changed: /v0.1.7/Dollyfile-system-build", and the three images without a
  base (ps, dolly-docs, parakeet) for their own text. `snapshots took 20920.5s`: 5 h 49 min of the
  13 h 31 min from the round's start to the release's end.
- What changed in substance: every recipe of `v0.1.6` against `v0.1.7` with the version segment
  and the artifact pins normalized away differs in three: `demos/godot/Dollyfile-airtime-godot`
  (the game's `hud.gd`), and `demos/wine/Dollyfile-wine-build` and
  `demos/studio/Dollyfile-dollyfile-studio` only because their source tars hold the version:
  NetSurf's `version.h` (`demos/wine/prepare-sources.sh`, `#define DOLLY_VERSION` from
  `package.json`) and a copy of `page/version.mjs` (`demos/studio/prepare-sources.sh`). With
  version-free references the round builds those three and their two dependents (godot-airtime,
  wine): 230 s of build time instead of 20,920 s (`version-free-1117.txt`); without the two
  embedded versions, airtime-godot and godot-airtime, 35 s.
- The bytes: v0.1.6 and v0.1.7 were built at the same image inputs (`DOLLY_IMAGE_BUILD_ID`
  `sha256:87c27243…`). Of v0.1.7's 37.19 GB of snapshots, 35.70 GB (96.0%) are in packs v0.1.6
  already had (`pack-overlap-016-017.txt`). 440 of the 2,294 distinct packs are new: 223 hold a
  retained recipe (the version text), 217 (665 MB) the rest: airtime, wine and studio, and the
  builds that differ by a few bytes each time (`20261116-140603-buildtime-05`)
  (`new-packs-016-017.txt`).
- The decision record: the owner chose versioned recipe URLs on 2026-10-07
  (`tasks/20261007-131241-release-v010`). Its plan priced it: "the round after the change rebuilds
  the whole catalog (about 80 minutes; *measure*). That happens once per version, when
  `package.json` moves, not on release day." Measured now: 5 h 49 min (76 images then, 230 now);
  and 0.1.7, a fix release (the npm packaging, and Airtime's HUD), made the bump its first step,
  so it rebuilt 230 images where its own changes needed 2 (5 with the two sources that hold the
  version).
- A second effect of the version: `demos/llvm/pin-seed-compiler.mjs` writes the seed compiler's
  URL with the current version (`releases/download/vX.Y.Z/`), so the round's fixed-point check
  (`git diff --quiet -- config/source-pins.sh`, `work/round-1117.sh`) reads "NOT a fixed point"
  after every bump although the compiler (`c98f9ab6…`) is the same; 0.1.7 needed
  `work/release-0.1.7-chain2.sh` and `-chain3.sh` to accept that by hand. The check's fix
  (compare `DOLLY_SEED_COMPILER_SHA256` alone) is in `tasks/20261116-140017-repo-01`.

What it departs from: "Development iteration speed is king"; "keep image rebuilds and full
distribution checks out of routine source-only iterations when unnecessary" (AGENTS.md).

## Smallest fix

1. Within the 2026-10-07 form: move `package.json` and `page/version.mjs` to the next version right
   after a release (the checklist's step 8 says so), so the bump's rebuild falls in the cycle's
   first seed round, which rebuilds everything anyway (the image inputs changed four times on
   13-14 November). A fix release still pays the full 5 h 49 min.
2. The version leaves recipe text: a recipe names a site file as `/PATH`, which a page resolves
   among its own version's files as `sitePath` does now (`page/static-asset.mjs:17-36`); pins stay
   the SHA-256 of the bytes. NetSurf and the studio read the version at run time (the page already
   writes `/etc/dolly/recipe.locator` at boot, `page/runtime-worker.mjs:20`). This revisits the
   owner's 2026-10-07 choice (a recipe would no longer name its version): it gives a fix release
   in the time of its own changes, and an unchanged image the same bytes across versions but for
   `buildtime-05`'s.

## Done when

With (2): after a bump in a scratch tree (`page/version.mjs`, `package.json`,
`node scripts/update-recipe-pins.mjs`), `npm run image -- --plan` against the previous version's
`dist/` lists `reuse` for every image whose recipes and inputs did not change. With (1) only: the
bump is the commit after each release (0.1.8's now, before its round), and this task closes on
that with the owner's choice recorded.
