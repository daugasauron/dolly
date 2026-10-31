# v0.1.4 release candidate

- STATUS: DONE
- PRIORITY: 60
- TAGS: release,0.1.4

Owner (2026-10-29): "focus on having 0.1.4 release candidate ready for me tomorrow morning
7am". A candidate is local: nothing is pushed, published or deployed until the owner says so.

## Released (2026-10-31): `v0.1.4` = `42f0bf21`

Owner (2026-10-30): "go ahead and release 0.1.4 commit, tag, push to slopshare daugasauron
github and publish npm", after the npm guide's audit (`pi-minimal`, `boot()`'s `files`, the
README's relay, `docs/agent-frontend.md`).

| Check on `42f0bf21` (`work/rc-1030.sh`, `work/rc-1030-suites.sh`) | Result |
|---|---|
| Domain site | release `cdd85fc5...`, 22.3 GB, accepted |
| GitHub Pages subset | release `b6001ec0...`, export 839,186,675 bytes of 1 GB, accepted |
| Release checklist, steps 1 to 3 and 6 | passed; deployment v0.1.0 to v0.1.4, 14,046 files; v0.1.4's list `1715778c...` |
| GPU (Xvfb, NVIDIA) | local-llm, 0ad-spidermonkey, 0ad-engine, 0ad-graphics, slopyard, mojo: all passed |
| Served boot, core browser suite | `default` boots in Chromium and Firefox; the suite passed in 442 s |
| The docs chain's demos | 7 passed, 0 failed |

Released: tag `v0.1.4` and `main` pushed; the GitHub release with `dolly-pages.tar.gz` and the
seed compiler; the Pages workflow (run 41141881973) succeeded and
`https://daugasauron.github.io/dolly/v0.1.4/` boots `default` in Chromium and Firefox; the 13
npm packages at `0.1.4` ([npm release](../20261025-014414-npm-release/TASK.md)); slopshare.dev
(wrangler, deployment `eb9d045d`, about 55 minutes at 4 MB/s): it serves every file of v0.1.4
and the lists of v0.1.0 to v0.1.4, and each of the five versions boots `default` in Chromium and
Firefox. The deployment is archived in `work/locks/published/v0.1.4`.

The checklist's deploy command failed twice before it uploaded anything. A user unit has the
manager's PATH (Node 12, which wrangler 4 refuses) and runs in the home directory, where
wrangler made its project directory `.wrangler/`, which it then also took for its legacy
global configuration, finding no login there. It now runs in the project with the caller's
PATH (`scripts/release-checklist.sh`).

## State (2026-10-30, 08:15): npm candidates published; main pushed, untagged

Owner, 07:00 to 08:00: npm candidates ("can you do like 0.1.4-rc?", "go ahead with rc"), with
a bypass-2FA token; a README section on serving Dolly locally with npm that runs Pi under a
policy; "commit and push (don't tag yet)".

| npm | Packages | |
|---|---|---|
| `0.1.4-rc.0` | 11 of 12 | npm refused `@daugasauron/dolly-host-download`: "That word is not allowed"; deprecated |
| `0.1.4-rc.1` | 12 | `download@0`'s package is `dolly-host-save`; installed from npmjs.com, `test/npm-browser.mjs`'s checks passed in Chromium and Firefox |
| `0.1.4-rc.2` | 13 | adds `dolly-image-pi-agent` (67 MB); `latest` and `rc` point at it |

The registry adds `0.0.0-stage` ("Temporary package placeholder for staged publishing") to
each new package; a new package's first version appears a few minutes after its publish.

Commits after the first candidate, none of which changes an image (the plan reuses all 185):
- `a69a5d71`: a browser test fails at its deadline whatever it awaits. The first suite ran four
  files in one 6 GB slot, the cap killed Chrome, and host-modules, awaiting its probe's request
  to the server, waited two hours; the suite then passed in a 20 GB unit.
- `a4cf917c`: `package-npm.mjs OUT [VERSION]`, the checkout's version or a prerelease of it.
- `aeb1e71e`: `download@0`'s npm package is `dolly-host-save`.
- `155211db`: the README's "Pi with npm" (packages, page with a one-rule policy, a server with
  cross-origin isolation); `pi-agent` packaged as `default` is; `test/npm-browser.mjs` runs the
  section as written. Source 446/0; the npm test passed in Chromium and Firefox.

## The candidate to tag (2026-10-30, 09:52): `de70eb2e`, the pushed `main`

Packaged and checked from `de70eb2e`, as the first candidate below; nothing tagged.

| Check | Result |
|---|---|
| Domain site | `build/rc-1030b-domain-releases`, release `5edf7122...`, 22.3 GB, accepted; served on 9015 |
| GitHub Pages subset | `build/rc-1030b-github-releases`, release `20ef5fb9...`, export 839,180,815 bytes of 1 GB, accepted |
| Release checklist, steps 1 to 3 and 6 | passed: no credential, both sites sealed from `de70eb2e`, the 13 npm packages packed, installed into an empty app and booted; deployment v0.1.0 to v0.1.4, 14,046 files, v0.1.4's list `f92b7149...` |
| GPU (Xvfb, NVIDIA) | local-llm, 0ad-spidermonkey, 0ad-engine, 0ad-graphics, slopyard, mojo: all passed |
| Served boot | `default` boots from the domain site in Chromium and Firefox |
| Core browser suite (Chromium, Firefox) | all passed in 575 s |
| The docs chain's demos | pi, pi frontend, bhop, rts, classicube, studio, speech, pi-phone: 7 passed, 0 failed |

The owner's commands are the checklist's (`build/rc-1030b-evidence/checklist.log`). Its npm
loop publishes `0.1.4` under `latest`, which then leaves `0.1.4-rc.2`.

## The first candidate (2026-10-30, 01:40): `20a9ed5b`, packaged and served

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

Lean is not in it (owner, 07:40: "disregard lean from 0.1.4"). Its four images build on `demo/lean` (`4eb2ac12`), but `amy install lean`
in `default` was killed by the test's 6 GB cap 16 s into the install: the kernel holds about
4.6 GB while the packages install, and the page merges each package's packs into one buffer.
Firefox was not run, and stage 0's `lean` failed twice in about 6,000 runs with `memory access
out of bounds`, the cause not found. Its two core commits (the pack bound follows the image
bound; a build enables `stack@0`) stay with it ([lean](../20261027-232422-lean/TASK.md)).

