# A version bump rebuilds all 230 images: 5 h 49 min of 0.1.7's release for five images' change

- STATUS: OPEN
- PRIORITY: 300
- TAGS: audit,build,release,0.1.8

From the build-time audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`). Evidence and the scripts that produced it: `work/audit-1116-evidence/buildtime/`.

## State (2026-11-16)

Measured; nothing changed. `main` (`b09b1e243`) is still 0.1.7 (`page/version.mjs`), though
`docs/deployment.md`'s step 8 moves it to the next version after a release; so the 0.1.8 round
rebuilds every image for the bump unless this is settled first.

## Found

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
