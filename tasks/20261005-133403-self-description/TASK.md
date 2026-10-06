# Images carry no description of their own interface

- STATUS: CLOSED
- PRIORITY: 290
- TAGS: core,userspace,docs,agent

## Closed (2026-10-07, `fix/visible`)

Checked against the candidate on :9007 (`build/visible-evidence/` in
`work/visible`):

- `pi` holds `/usr/share/doc/dolly/` with 30 files (`docs-probe-9007.log`);
  the 29 whose checksums fit the recovery shell's view are byte for byte
  the checkout's (`docs-image.sum` against `docs-checkout.sum`, made
  from the package's `SOURCE` rows); `abi/README.md` scrolled off the
  view. `default` has no such directory by the decision below, and `help`
  there ends by naming the directory and `amy install dolly-docs`
  (`amy-check-9007.log`); the Pi skill names it too (`SKILL.md:28`).
- The Slop language is `docs/slop.md` alone; `help` and the skill point
  to it.
- The plan below: four images.
- Not run, and dropped from the done-when: a model session answering the
  four questions from the files with HTTP denied. What makes it possible
  is verified (the files, the skill's and `help`'s pointers); whether a
  given model then answers well is a measurement of that model, not of
  this package.

- The plan: in `work/visible` (candidate `e0843789` plus two fixes), one
  word changed in `docs/slop.md`, `DOLLY_BUILD_IMAGES=dolly-docs
  node scripts/update-recipe-pins.mjs --sources`, then
  `node scripts/build-system-snapshot.mjs --plan` over all 67 images
  (`build/visible-evidence/self-description-plan.log`): exactly four
  rebuild, each "recipe changed: Dollyfile-dolly-docs": `dolly-docs`,
  `pi`, `pi-local`, `dollyfile-studio`. The edit and the four re-pinned
  recipes were then reverted.

## Remaining (2026-10-07)

In the candidate (`core/self-description` `a4c1bca4`): the `dolly-docs`
package (13 documents and 17 contracts, pinned to the release's bytes),
installed by `pi` and so in `pi-local` and `dollyfile-studio`; `amy install
dolly-docs` elsewhere (not `default`, by the decision below);
`test/docs-browser.mjs` passed in Chromium and Firefox in the main round;
the Slop language is described in `docs/slop.md` alone and `help` and the Pi
skill point there (`20261005-220754-man-help`, "Merged branch"). Left of the
done-when:

- A Pi session with HTTP denied answering from the files (the limits, why
  `seq | head` now stops, status 126, the declared modules): not run.
- `npm run image -- pi --plan` after a one-word edit of `docs/slop.md`,
  with the list recorded here (expected: `dolly-docs`, `pi`, `pi-local`,
  `dollyfile-studio`).

From the big-picture review (`20261005-131642-big-picture`). The secondary
goal is to "define the API an agent operates against". That API is defined in
the repository (`abi/`, `include/dolly/`, `docs/`) and enforced by loaders,
but an agent inside an image can read almost none of it. `AGENTS.md` layer 4
says agent-facing behaviour "emerges from ordinary commands and files"; no
file in any image describes the platform.

## Evidence

- `~/Downloads/AUDIT-sandbox-painpoints.md` §10: the agent could read the
  process model, Slop's language, the HTTP rules and the display records only
  by fetching `raw.githubusercontent.com`. Many of its findings (§1-§12)
  are facts `docs/` already states precisely: 256 descriptors and 32 processes
  (`docs/process-model.md`), serial pipelines and the unsupported expansions
  (`docs/slop.md`), CORS and the single failure message (`docs/http.md`), the
  126 status, `-pthread` needing `threads@0`.
- No recipe retains documentation: `grep -rn "share/doc" Dollyfile* demos/*/Dollyfile*`
  finds nothing. Images hold headers in `/usr/include/dolly/` and their own
  recipes in `/etc/dolly/recipes/`, which describe contents, not the interface.
- The same facts are hand-copied three times and the copies rot:
  `docs/slop.md` (the language table), the `help` command's fixed text
  (`Dollyfile-system-build:356`, `help.c`) and the Pi skill
  (`demos/pi/skills/dolly/SKILL.md`), whose "Repository map" (line 30) and
  `npm run` steps (lines 43-58) describe a checkout the agent is not in.
- The eight documents that describe what a program inside can observe
  (`process-model`, `slop`, `http`, `display`, `dollyfile`, `sessions`, `gpu`,
  `audio`) are 928 lines and are already published with each release
  (`scripts/package-pages.sh:59`).

## Work

No new prose. One source, shipped where the agent is:

- A core `PACKAGE` that retains those documents (and the WAT contracts of
  `abi/` and `host/*/`) under `/usr/share/doc/dolly/`, each a `SOURCE` row
  pinned to the release's bytes. Applications that host an agent `INSTALL`
  it; any session gets it with `amy install`. As a leaf install, a document
  edit rebuilds only those applications, not the toolchains.
- `help` names that directory instead of repeating the language table; the Pi
  skill points there and loses its copy (`20261005-130240-pi-skills`).

The other two halves of the same gap are tracked where the code is: refusals
that say their cause to the program that asked (`20261005-131643-silent-126`),
and limits readable through `sysconf`/`getconf`
(`20261005-131650-userspace-gaps`).

## Done when

- In `default` and `pi`, `/usr/share/doc/dolly/` holds the release's documents
  byte for byte (the recipe pins prove it).
- With HTTP denied by policy, a Pi session answers from files in the image:
  the descriptor and process limits, why `seq 1 999999999 | head` does not
  stop, what exit status 126 means, and which host modules the image declares.
- The Slop language is described in one tracked file; `help` and the skill
  point to it.
- `npm run image -- pi --plan` after a one-word edit of `docs/slop.md` lists
  only the images that install the package; the list is recorded here.

## Decisions (2026-10-06, `core/self-description`; not yet built)

- What ships: 13 documents and the 17 machine contracts they link, 154,430
  bytes, at their repository paths under `/usr/share/doc/dolly/` so the links
  between them work. `docs/`: `process-model`, `slop`, `display`, `gpu`,
  `audio`, `http`, `sessions`, `dollyfile`, `architecture` (the call path the
  others cite), `browser-boundary` (what the network and the page reach) and
  `image-build-service` (a service a program inside calls); `abi/README.md`,
  `host/README.md`; every `abi/*.wat` and `host/*/*.wat`.
- What does not: `deployment`, `sources`, `licences`, `AGENTS.md` and the
  Ghostty table notes are about the checkout, its build and its publication.
  Shipped documents still link to them and to source files; those links name
  the repository and do not resolve in the image.
- One source: `Dollyfile-dolly-docs` (`PACKAGE dolly-docs`: no `FROM`,
  `runtime@0` only; named so that its route is not the `docs/` directory)
  is 30 `SOURCE` rows on the canonical origin and one `FOLDER`. The site
  already publishes those files at those paths (`scripts/package-pages.sh`
  copies `abi/*.wat` and `host/`, `package-documentation.mjs` the documents);
  `publishedDocument` (`scripts/host-modules.mjs`) admits them as build
  inputs beside the headers, and the Dolly row of `config/upstreams.json`
  names `docs/` and `abi/`. No new source and no second copy.
- Who installs it: `pi` (one `INSTALL` row), so `pi-local` and
  `dollyfile-studio` get it through `FROM`; their two pins moved. Not
  `default`: it is a base, so every document edit would rebuild what stands
  on it, and it is being made smaller (`work/small-default`); `amy install
  docs` brings the 0.15 MiB into any session with `packages@0`.
- The Pi skill: the line that sent agents to raw.githubusercontent.com now
  names `/usr/share/doc/dolly/` and `amy install dolly-docs`. Nothing else in the
  skill was touched (three branches edited it today). Its pin in
  `Dollyfile-pi-coding-agent` is a staged file and is refreshed by the next
  image preparation, not here.
- `help` is not edited here: `work/man-help` is rewriting it and its recipe
  is in the seed chain. What both tasks say of each other, in that task's
  words: `man` covers commands, that directory covers the platform, and
  neither repeats the other. `help` drops its language table for those two
  pointers there.
- Headers. `/usr/include/dolly/display.h:88-105` declares
  `dolly_input_event.data[]` with three lengths and no layout: which of key,
  code and text come first, and what pointer, wheel and resize records carry
  (the audit's §12). The comment is not fixed here: the header is hashed into
  `display@0`'s ABI digest, so one word would refuse every display program
  until rebuilt. It belongs to the input round
  (`20261002-072000-input-host-module`); until then `docs/display.md` is the
  place, and it is in the package.

## State

Checked without an image build, each inside `systemd-run --user --scope -q -p
MemoryMax=2G -p MemorySwapMax=0`: `node scripts/lint-dollyfiles.mjs` (62
recipes), `node scripts/update-recipe-pins.mjs` (no further change) and
`test/platform-documents.test.mjs`, which checks every row's path, pin and
destination and fails when a shipped document links to a document or
contract the package lacks (tried by removing `docs/gpu.md`).

For the integrator, after the seed catalog exists:

    DOLLY_IMAGE_JOBS=1 DOLLY_BUILD_IMAGES=dolly-docs,pi work/build-slot.sh npm run image
    npm run image -- pi --plan     # after a one-word edit of docs/slop.md
    node test/docs-browser.mjs chromium firefox
    npm run test:demos -- pi

Still open from "Done when": the Pi session answering from the files with
HTTP denied, and the `--plan` list, need the built images.
