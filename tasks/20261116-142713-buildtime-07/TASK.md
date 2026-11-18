# Release acceptance records PASS for 8 images it checks nothing of: the GPU images without a compiler

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: audit,build,release,0.1.8

From the build-time audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`), timing the acceptance (`20261116-140603-buildtime-03`). Evidence and scripts:
`work/audit-1116-evidence/buildtime/` (`time-acceptance.mjs`, `acceptance-time-all.txt`,
`acceptance-coverage.mjs`, `acceptance-coverage.txt`).

## State (2026-11-17)

Closed: see the closing section.

## Found

`acceptImage` (`scripts/accept-release.mjs`) checks an image in two ways: an in-page build of an
inventory recipe `FROM` the image, when its manifest holds `/bin/dollyfile` and `/bin/cc`; and a
boot of its prebuilt route, when it requires `display@0` and not `gpu@0`. An image with neither
returns at once, and `acceptSite` (`scripts/site-release.mjs:197-232`) writes
`PASS image-inventory IMAGE` for it all the same. Of 0.1.7's 59 accepted images:

| Checked | Images |
| --- | --- |
| inventory build and route boot | 30 |
| inventory build only | 9 |
| route boot only | 12 |
| nothing (0.2-0.3 s each) | godot-airtime, godot-lantern-drift, godot-voxel-flyover, mojo-gpu, photocraft-photos, slopyard, xonotic, zero-ad |

For `xonotic` the release's server saw four requests: the build page, its favicon,
`dolly-images.json` and the image's snapshot metadata (`acceptance-requests.txt`); for `default`
and `neovim`, the route and its page's modules.

The eight are the GPU games and showcases, all `display@0` with `gpu@0`, none with the engine or
the compiler; `release/acceptance.txt` of the release lists `PASS image-inventory` for each. The
round's GPU stage runs some of them (xonotic, slopyard, zero-ad, godot) against `dist/`, not the
sealed release. A route that requires `gpu@0` boots without an adapter: Xonotic's test boots
`xonotic-build` (`gpu@0` too) headless in the demos suite, where "the client drew in software,
gpu@0 having no device" (`round-1117-evidence/demos.log`).
`docs/deployment.md:198` says "release acceptance boots each route under it with no violation".
Why `gpu@0` images are left out is not recorded (the line came with `f56fd2469`, a move).

What it departs from: "Verify changes in a real browser"; a check that ran nothing reports a pass.

## Smallest fix

Boot the route of every image that requires `display@0`, `gpu@0` included, headless as the
acceptance's Chrome is (`--enable-unsafe-webgpu`, no adapter); and write in `acceptance.txt` the
checks each image passed, so an image with none is refused rather than passed.

## Done when

`site-release.mjs accept` on a domain release boots the eight routes (or names why one cannot
boot), and no image's acceptance line is written without a check behind it.

## Closed (2026-11-17)

Fixed on `ws/release` (`107447f3c`): `acceptImage` boots the prebuilt route of every image that
requires `display@0`, `gpu@0` among them, in the acceptance's headless Chrome
(`--disable-gpu --enable-unsafe-webgpu`, the software adapter), and throws for an image that has
neither the compiler to build on nor a display to boot, so `acceptSite` writes no line without a
check behind it. The line's text stays `PASS image-inventory IMAGE` (`ws/speed` rewrites
`acceptSite` and the acceptance's text for side-by-side acceptance today; one rule and its
refusal are here).

Evidence: this branch's `acceptImage` on the eight images of 0.1.7's sealed domain release
(`build/domain-releases-0.1.7/current`, read only), one at a time, as `site-release.mjs accept`
runs it (`build/ws/accept-eight.mjs`, log `build/ws/logs/accept-eight.log` in the branch's tree):
each route reached "ready" with no 404, no Content-Security-Policy violation and no request of the
compiler seed: godot-airtime 5.3 s, godot-lantern-drift 3.0 s, godot-voxel-flyover 2.1 s,
mojo-gpu 2.7 s, photocraft-photos 2.9 s, slopyard 2.7 s, xonotic 11.5 s, zero-ad 29.8 s; about a
minute more of acceptance, one after another. The packaging round's `site-release.mjs accept`
runs the same function on 0.1.8's release.
