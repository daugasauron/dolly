# v0.1.4 release candidate

- STATUS: OPEN
- PRIORITY: 60
- TAGS: release,0.1.4

Owner (2026-10-29): "focus on having 0.1.4 release candidate ready for me tomorrow morning
7am". A candidate is local: nothing is pushed, published or deployed until the owner says so.

## State (2026-10-30, 01:40): packaged and served, the owner's to try

Tag `rc-2026-10-30` = `20a9ed5b` (local `main`, version 0.1.4, 185 images, image inputs
`45d43ca5...`). Since v0.1.3: 485 commits; the npm packages are the release's main feature.
Two commits for the candidate: the docs say how deep the fresh stacks of `stack@0` nest, and
the release checklist's credential scan accepts an upstream's public test key listed by the
SHA-256 of its PEM block (`config/public-test-keys.txt`). Go's
`src/crypto/tls/testdata/example-key.pem` and `src/crypto/x509/platform_root_key.pem` are in
the go, go-build, go-sdk and go-tools snapshots, and stopped the scan; both digests were
checked against Go 1.27.3's archive, whose SHA-256 is the recipe's pin. An unlisted key still
stops it.

| Check | Result |
|---|---|
| Catalog (`b10147a9`, the same images as `20a9ed5b`) | every image built; source 446/0, artifacts 26/0 |
| Demos (2026-10-29, before the docs chain's rebuild) | 40 passed, 5 on-demand or windowed skipped, 0 failed |
| Core browser suite and the docs chain's demos on `20a9ed5b` | every core browser test (121 runs, Chromium and Firefox, 513 s); pi, pi frontend, bhop, rts, classicube, studio, speech and pi-phone passed |
| Domain site (slopshare.dev) | `build/rc-1030a-domain-releases`, release `2758ca24...`, 22.3 GB, accepted |
| GitHub Pages subset | `build/rc-1030a-github-releases`, release `322a33d8...`, export 839,180,448 bytes of 1 GB, accepted |
| Credential scan (commits since `origin/main`, every snapshot) | none, but the two listed Go test keys |
| npm packages | packed from `20a9ed5b` (`@daugasauron/dolly`, ten host modules, `dolly-image-default`), installed into an empty app and booted in Chromium and Firefox |
| Deployment (checklist step 6) | `build/pages-v0.1.4`: v0.1.0 to v0.1.4, 14,046 files; v0.1.4's list `8cc769e3...` |
| GPU (Xvfb, NVIDIA, `20a9ed5b`) | local-llm, 0ad-spidermonkey, 0ad-engine, 0ad-graphics (hardware), slopyard, mojo (SwiftShader, NVIDIA, Firefox 157): all passed |
| Served release, Chromium 156 and Firefox 157 | `published-version.mjs boot` passed on ports 9016 and 9015 |

Served as it would be deployed by the user unit `dolly-serve-rc-9015`:
http://127.0.0.1:9015/ leads to `/v0.1.4/`; unversioned paths are 404. v0.1.3's candidate
stays on 9014. Evidence: `work/x11fix/build/rc-1030a-evidence/` (`work/rc-1030.sh` ran it,
`work/rc-1030-suites.sh` the suites).

Lean is not in it. Its four images build on `demo/lean` (`4eb2ac12`), but `amy install lean`
in `default` was killed by the test's 6 GB cap 16 s into the install: the kernel holds about
4.6 GB while the packages install, and the page merges each package's packs into one buffer.
Firefox was not run, and stage 0's `lean` failed twice in about 6,000 runs with `memory access
out of bounds`, the cause not found. Its two core commits (the pack bound follows the image
bound; a build enables `stack@0`) stay with it ([lean](../20261027-232422-lean/TASK.md)).

After the tag, on `core/release-fixes`: `a69a5d71`, a browser test fails at its deadline
whatever it awaits. The candidate's first suite ran four files in one 6 GB slot, the cap killed
Chrome, and host-modules, awaiting its probe's request to the server, waited two hours; the
suite then passed in a 20 GB unit. The change ships nothing.

Not done, because a candidate is local: tag `v0.1.4`, push, GitHub release, `npm publish`,
deployment. `scripts/release-checklist.sh` prints the commands
(`build/rc-1030a-evidence/checklist.log`).
