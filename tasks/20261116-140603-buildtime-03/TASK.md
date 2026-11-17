# Packaging takes 31-38 min: 59 acceptances one after another (24.5 min), the sealed site verified five times, every pack gzipped again

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: audit,build,release,0.1.8

From the build-time audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`). Evidence and scripts: `work/audit-1116-evidence/buildtime/`. Measured on 0.1.7's
domain release (`build/domain-releases-0.1.7/current`, read only).

## Found

0.1.7 packaged its domain site twice (`round-1113-final.log`: 09:40-10:18, 38 min; 13:35-14:06,
31 min, after a start at 13:26 stopped by a full disk); 0.1.6 four times on 14 November (a
candidate at 09:22; rc.0 19:45-20:21, rc.1 21:22-21:53, rc.2, the released commit, 22:01-22:30).
Each packaging (`scripts/package-pages.sh`) and what follows it does the same work again:

- The sealed site is verified five times. `site-release.mjs accept` runs `verifySite` (line 198)
  and hashes every file twice (199, 227), then `verifyRelease` (232: hashes again and runs
  `verifySite` again); `publish` runs `verifyRelease` once more (179); the checklist's step 3 once
  more; the export's `releaseFiles` once more (165) before it reads and hashes each file again.
  Measured: `verifyRelease` 142 s and 11.1 GB of resident memory (`site-verify.txt`), the file
  hashes alone 15 s (`site-manifest-time.txt`), so `verifySite` (every pack gunzipped, every
  snapshot reassembled and checked) about 127 s. Per packaging, checklist and export: 5 `verifySite`
  and 7 hashes, about 12 min, where one `verifySite` and one hash at each end check the same bytes.
  0.1.7 with its two packagings and two exports: about 22 min.
- Every pack is written again: `scripts/share-pages-snapshots.mjs` gzips each of the 2,294 packs
  (18.97 GB raw) at level 6 into the staging directory, about 5 min of one core
  (`tasks/20261115-115901-release-disk`, which holds the measurement and the fix with the disk's).
- Acceptance runs the 59 images that are not packages one after another, each in a fresh Chrome
  profile (`acceptSite`, `scripts/accept-release.mjs`). The same loop timed on the sealed release
  (`time-acceptance.mjs`, `acceptance-time-all.txt`): 1,468 s, 24.5 min, the larger part of a
  packaging; the 39 images that build in the page take 1,454 s of it (go-sdk 132 s, go-build 91,
  dollyfile-studio 81, pi-local 75, go-tools 74), the other 20 under 3 s each (eight of them check
  nothing: `20261116-142713-buildtime-07`). The same 59 four side by side
  (`time-acceptance-parallel.mjs`, `acceptance-parallel-4.txt`): 730 s, all accepted, half the
  time, measured with an image build (four cores) and another agent's tests beside it.
- Packaging the domain site narrows the checkout's `dist/dolly-images.json` and `amy-index.txt`
  to its images (`scripts/generate-routes.mjs:45-69` under `DOLLY_BUILD_IMAGES`), so the release
  runs `npm run image` again to restore them for the checklist (`work/release-0.1.7.sh:47-48`,
  168.8 s, `release-0.1.7-evidence/full-catalog.log`).
- Memory: `docs/deployment.md:97-100` says a release build needs "little memory", `accept` "about
  twice the largest image while it merges that image's packs" (zero-ad-data, 1.93 GB: about
  3.9 GB); the one `verifyRelease` measured held 11.1 GB resident (`site-verify.txt`).
- Measured small: the export's brotli of six files, 24 s (`brotli-rate.txt`).

What it costs, per packaging: acceptance 24.5 min one at a time (12.2 min four side by side, on a
busy machine), two `verifySite` passes and three hashes more than needed (about 5 min), the packs'
gzip (about 5 min), and 2.4 min more in the export: about 25 min, paid twice in 0.1.7's release
and four times in 0.1.6's.

## Smallest fix

- One check per stage: `accept` verifies once before acceptance and writes the seal; `publish`
  compares the seal's digest and renames; the export checks each file against the seal as it reads
  it (it does) without `verifyRelease` first. The checklist keeps its `verifyRelease` as the gate.
- Acceptance four side by side, as the browser suite runs its tests, each with a server of its own:
  `acceptImage` clears and reads its server's request log (`server.requests`) to check that no
  image fetched the compiler seed.
- `generate-routes.mjs` writes a narrowed registry and index into the staging site, not into the
  checkout's `dist/` and root.

## Done when

A domain packaging of an unchanged catalog, timed per step, runs `verifySite` once, accepts four
at a time and leaves `dist/dolly-images.json` as it was; the checklist and the export after it run
`verifySite` once between them.

## Closed (2026-11-17)

On `ws/speed` (`68dcecd52`). No image rebuilds: packaging is not an image input.

- `site-release.mjs accept` runs `verifySite` once and hashes the site once, accepts the images four
  side by side, each Chrome with a server of its own (so each image's check that it fetched no
  compiler seed reads its own requests), and writes the seal. `publish` takes the seal's digest
  (refusing a site whose acceptance is not of it) and renames; the export checks each file
  against the seal as it reads it, and lists in `deployment.sha256` the digests it hashed rather
  than reading its 24 GB again. The checklist's `verify` stays the gate: the one `verifySite`
  between packaging and deployment.
- `generate-routes.mjs SITE` generates the release's pages, registry and package index in the
  staged site; the checkout's `dist/dolly-images.json` and `amy-index.txt` are untouched, so no
  `npm run image` restores them. `package-pages.sh` takes the images and the sources from that
  registry: `list-images.mjs` ran twice (57 s, the second hashing 12 GB of sources again) and its
  `--sources` is gone.
- Packs and sources: `20261115-115901-release-disk`.

Measured: 0.1.7's domain catalog packaged again with these scripts, in a checkout of `b09b1e243`
inside `work/speed/build` with 0.1.7's images linked (`work/audit-1116-evidence/buildtime/fix-speed/`:
`scratch-setup.sh`, `package-run.sh`, `package-pages*.log`, `package-run*.log`, `verify*.log`,
`export*.log`), twice. Both releases are 0.1.7's sealed release file for file but the changed
scripts and `release/`; the export is 0.1.7's published deployment of v0.1.7 the same way, and every
file matches its `deployment.sha256`. The checkout's registry was unchanged after each.

| Step | Run 1 | Run 2 (every pack in the store) |
| --- | --- | --- |
| pages, registry, index in the site | 30 s, then `list-images` twice 57 s | 25 s, registry read |
| packs (`share-pages-snapshots.mjs`) | 4 min 14 s, 560 packs written (100 MB) | 4 min 40 s, none written |
| accept: `verifySite` and the hash | about 6 min | about 7 min |
| accept: 59 images, four side by side | about 24 min, all accepted | about 31 min, all accepted |
| packaging in all | 36 min | 43.6 min |
| checklist's `verify` | 4 min 20 s, 11.1 GB resident | 7 min, 11.1 GB |
| export (two published versions checked, v0.1.7 exported) | 20 min 50 s, 4.4 GB | 23 min 25 s, 4.4 GB, its list from the digests it hashed |

The machine was not the round's: other agents' builds and browser tests held a load of 30 to 52 on
its 16 threads all morning (`vmstat`: no idle CPU), and the same `verify` took 4 min 20 s and
7 min an hour apart. Back to back on the same inputs instead: the packs step, 0.1.7's script (a
gzip of every pack) 567 s against this one's 253 s (`share-compare.log`). Starting the largest
image's acceptance first, replayed on the serial loop's times, saves 5% (388 s against 368 s,
`simulate-acceptance.txt`), so the order stays. What these runs cannot show, the 0.1.8 round's
packaging on a quiet machine times: the steps above against 0.1.7's 31 and 38 minutes.
