# Deployment path is manual, duplicated and partly undocumented

- STATUS: CLOSED
- PRIORITY: 120
- TAGS: build,doc

Two exporters each write the whole ~10 GB export; a tarball is always created though the domain
deploy discards it; the site is hashed about five times; `package-pages.sh` duplicates its file
lists (`:34-99`, `:120-216`) and they have drifted. `gh release upload` and the workflow
dispatch are undocumented; post-deploy verifiers were untracked in `build/deployments/`.
`docs/deployment.md:16-17,63,107` references `build/releases/current` while packaging writes
`{domain,github}-releases`.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

One documented publish path with one file list.

## Done when

- Deployment doc matches the scripts; duplicate lists merged.

## Progress (2026-10-01)

`docs/deployment.md` now matches the scripts for the local path: `npm run
publish` (`package-pages.sh`, defaults `build/dolly-pages.tar.gz` and
`build/releases`) seals a release and moves `build/releases/current`, and
`npm run serve` follows it; the afternoon checkpoint (`35b11b69…`) was deployed
that way, and `DOLLY_BUILD_IMAGES` limits the catalog. The GitHub release and
workflow dispatch are described. `package-pages.sh` is 122 lines with one list
of `dist` files (the duplicated lists are gone). Left: every publish also writes
the Pages tarball (5.4 GB for the local checkpoint), and the site is hashed by
both `site-release.mjs accept` and `publish`.

## Closed (2026-10-01, `fix/publish-path`)

`package-pages.sh RELEASES SITE` no longer writes a tarball: it stages the site
beside the releases and `site-release.mjs publish` verifies it once and moves it
into place, without the 5.9 GB copy and second verification. Only the GitHub
path tars `RELEASES/current`; `docs/deployment.md` lists that step, the release
and the workflow dispatch, and that the seed ships as Pages parts. Checked with
`DOLLY_BUILD_IMAGES=default bash scripts/package-pages.sh build/test-releases`
(release `fcefcc2c…`, no staging left behind) and `site-release.mjs verify`
against the checkout; source suite 259/259.
