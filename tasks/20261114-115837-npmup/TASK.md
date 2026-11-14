# npm: the upgrade guide from 0.1.5 to 0.1.6, verified on a real 0.1.5 project

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: npm,0.1.6

The owner (2026-11-14): "I want a separate changelog/release notes/guide for people upgrading the npm
module from 0.1.5 to 0.1.6. There should be a lot of improvements."

Branch `feature/npm-upgrade` (tree `work/npmup`, from `feature/npm-model-take`). No seed input changed.

## What was made

- `docs/npm-upgrading.md`, "From 0.1.5 to 0.1.6": what is better, what changes under an existing project
  (from `git diff v0.1.5..round/0.1.6-compiler`), the steps for a `dolly-build` project and for a page
  with `boot()`, saved sessions, the checks, and what was measured. Linked from `README.md`,
  `docs/npm.md` and `docs/npm-changelog.md`.
- Pi's `upload` tool, `upload@0` and `transfer` in `docs/npm.md` and the changelog (`feature/pi-upload`'s
  facts).

## Found by the diff and by the upgrade

- The module headers left `cc` for the `libdolly-NAME` packages, of which npm listed only
  `libdolly-download`: a 0.1.5 recipe compiling against `<dolly/display.h>` had nothing to install. The
  integrator's round added the thirteen to `config/npm-images.txt`; rc.0 holds them.
- rc.0's `dolly-build add` declared the host modules of the recipe's `INSTALL` rows only. A 0.1.5 project
  starts `FROM pi-minimal`, which gained `upload@0`: after `add` the build stopped with `/bin/upload uses
  upload@0: add REQUIRES HOST upload@0`. Fixed here: `add` also declares and installs the modules of
  the image a recipe starts `FROM` (`packages.json` in `dolly-build` lists the images' modules too).
  `test/npm-browser.mjs` removes `upload@0` and its package from the `FROM python-data` project and
  expects `add` to bring both back. This fix is not in the rc.0 tarballs.
- A 0.1.5 save is not found by the 0.1.6 page (`Session 'NAME' was not found in this browser.`), in a
  `dolly-build` project and in a `boot()` page, Chrome and Firefox. The guide says to get files out
  first. The 0.1.5 site served again at the same address did not open its save either (Chrome, once,
  180 s without a status), so the guide does not offer going back.

## Measured (2026-11-14, 20:25-21:10 JST, the machine busy with the round)

A project made from npmjs's 0.1.5 packages (`init my-pi git python numpy matplotlib`, a C tool including
`<dolly/display.h>`, a skill as `FILE` rows, a workspace file), built and booted at 0.1.5 with a session
saved in Chrome 156 and Firefox 155. Then the guide's steps as written, with `0.1.6-rc.0` for `0.1.6`,
against a loopback registry that serves npmjs's documents with the tarballs of
`work/round1113/build/npm-0.1.6-rc.0` added, and `dolly-build`'s script and `packages.json` replaced by
this branch's (the fix above):

- Steps 1 to 3: every dependency at 0.1.6-rc.0, five rows at new pins, no `/v0.1.5/` left. The build
  then stopped at the header, as the guide says; step 4 (`add my-pi libdolly-display`) and the
  `upload@0` row let it build (95 s).
- The site in Chrome and Firefox: Pi with its three skills, the C tool, Git, Python with NumPy and
  Matplotlib, `/bin/upload`, the policy's refusal, a save that opens again (0.7 s to ready in Chrome).
- Times to the page's ready status / Pi's screen, a fresh profile for each first visit: 0.1.5 Chrome
  4.8 / 6.9 s first and 5.3 / 8.1 s second, Firefox 11.7 / 14.6 s and 4.3 / 6.3 s; 0.1.6-rc.0 Chrome
  1.5 / 3.4 s and 1.2 / 3.5 s, Firefox 2.2 / 4.2 s and 1.6 / 3.7 s.
- A `boot()` page of 0.1.5's `default`, moved by the guide's two commands: boots in both browsers with
  nine modules, no `html` command.
- `test/npm-browser.mjs` with the fix, in a tree at the round's `2c41c0cb5` with the round's `dist`
  linked: Chromium passed in 218.4 s, Firefox in 245.1 s; requests beyond the machine: none.

Not measured: the test before the fix (the same step failed by hand on rc.0); the guide's optional steps
(skills as directories, the page without inline code, a recipe of packages) on the 0.1.5 project; pnpm
and Yarn; build times against each other.

## Closed (2026-11-14)

The guide exists, is linked from the three places, and its steps moved a real 0.1.5 project and a
`boot()` page to the rc.0 packages in Chromium and Firefox. For the integrator: the `add` fix has to be
in the packages that become 0.1.6, or the guide's step 2 leaves a 0.1.5 project without `upload@0`.
