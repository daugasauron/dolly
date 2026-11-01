# npm: build and host custom images, e.g. Pi with your own extensions and skills

- STATUS: OPEN
- PRIORITY: 310
- TAGS: npm,packages,pi,0.1.5

The owner, 2026-11-01 22:00 JST:

> Also, regarding the npm package, it should be easy to rebuild and customize images, for
> example it should be easy to create something that has custom pi extensions and skills
> bundled into the image that gets hosted.

Done when a stranger can follow the README's "Pi with npm" (and `docs/agent-frontend.md`):
write a Dollyfile `FROM pi-minimal` that adds a Pi extension and a skill, build it, host it,
boot it with `boot()`, and Pi has them; a browser test proves that from packed packages in
Chromium and Firefox; `docs/embedding.md` says how.

## How a stranger uses it

After the README's "Pi with npm" (Node, npm, Chrome):

```sh
npm install @daugasauron/dolly-build
npx dolly-build from pi-minimal my-pi > Dollyfile-my-pi   # a recipe FROM the installed pi-minimal
# add a FILE row per file before its ENTRY line, the body indented four spaces, e.g.
#   FILE /home/dolly/.pi/agent/extensions/hello.js   and   .../skills/changelog/SKILL.md
npx dolly-build Dollyfile-my-pi my-pi                      # builds in headless Chrome
```

Then `index.html` imports `images`, `image` and `modules` from `./my-pi/index.mjs` instead
of the package's, and the same `serve.mjs` hosts it: Pi starts with the extension and the
skill in the image. `--browser firefox` builds in Firefox instead; a rebuild needs `my-pi`
removed first.

## Today

The npm packages ship two prebuilt images (`dolly-image-default`, `dolly-image-pi-minimal`:
catalog, the closure's metadata, the image's packs, its recipes) and build none. `boot()`'s
`files` writes files over an image at each boot; nothing is bundled into an image. Building
is the site's code (`site.mjs`, `image-build.mjs`, `image-builder.mjs`, `build-worker.mjs`),
which left `@daugasauron/dolly` on 2026-10-23. And `pi-minimal` cannot be built FROM at all,
anywhere: a FROM build restores the base and runs the base's own `/bin/dollyfile`
(`build-worker.mjs`), and `pi-minimal` holds no engine (its manifest has no
`/bin/dollyfile`; `default` has one through `amy`).

## Design

1. **An image one can build FROM carries the engine.** A package `dollyfile` (core,
   `Dollyfile-dollyfile`: `FROM system-build`, `EXPORTS TOOL dollyfile`, the engine alone, as
   `amy` exports it beside `amy`) and `pi-minimal` INSTALLs it. Why: the engine runs inside
   the base, so the base must hold it; a package keeps it one row, and no runtime or build
   service change is needed. `amy` installs it too, rather than exporting the same file
   (State says why). This changes what `pi-minimal` contains (about the engine's size): it
   is a demo image, but the npm one, so the owner should know.
2. **The build runs in a browser, driven by a CLI.** A package `@daugasauron/dolly-build`
   with `npx dolly-build RECIPE OUT`: it serves the installed runtime and the image
   directory of the base (the image package installed beside it) with cross-origin
   isolation on 127.0.0.1, opens a page in
   headless Chrome (or Firefox, `--browser`) through `playwright-core`, builds there with
   the same in-page build the catalog uses (`scripts/page-image-build.mjs`: the custom
   recipe, its FROM and INSTALL artifacts from the base's packs, Dolly's builder Worker),
   reads the snapshot back, and writes OUT. Why a CLI and not only a build page: an npm user
   builds in a script or CI and needs files on disk that a host serves; a page cannot write
   a directory in Firefox, and a downloaded archive is a manual step. The runtime still runs
   only in a browser (AGENTS.md); the CLI moves bytes, as the repository's own
   `build-snapshot-browser.mjs` does. Why not the site's `/custom/`: its result lives in that
   browser's image cache, and it builds against the site's version, not the installed one.
3. **OUT is an image directory, the layout an image package has**: the catalog (the base's
   entries and the new image), the closure's metadata and recipes, the new image's packs
   and metadata, and an `index.mjs` exporting `images`, `image` and `modules` as the image
   packages do. `boot()` loads it with no change; a host serves it as it serves
   `node_modules/@daugasauron/*`. The packs and metadata are written by the code that
   writes the catalog's (`share-pages-snapshots.mjs`, `build-system-snapshot.mjs`'s metadata,
   `image-definitions.mjs`'s catalog entry), so there is one format.
4. **Recipes stay Dollyfiles.** The extension and the skill are `FILE` rows (their bodies
   indented four spaces); `npx dolly-build from IMAGE NAME` prints the recipe to add them to,
   with the `FROM` row of the installed image at its pin, so nobody copies hashes by hand.
   (`SOURCE` rows of files beside the recipe, with a `pins` command, were dropped: `FILE`
   covers extensions and skills, and they need more served and pinned; see State.)

## State (2026-11-01 23:20 JST)

Done as designed, measured; on branch `core/npm-custom-images` (from `core/audit-runtime`),
which the integrator merges into tonight's catalog round (it restales `amy`'s chain and
`pi-minimal`, which that round rebuilds anyway).

- `Dollyfile-dollyfile`, a core package: the engine alone, `FROM system-build`. `pi-minimal`
  installs it (134 KB more: 99.5 MB). `amy` installs it instead of exporting the same file
  itself: `test/dollyfile-catalog.test.mjs` requires an image with `amy` to record a package
  kept from its base, which the eight images with `amy` on `system-build` would otherwise
  hold unrecorded. Commit `807338ce`.
- The runtime package carries its builder (`src/image-builder.mjs`, `image-build.mjs`,
  `build-worker.mjs`, `host/http/local-services.mjs`), whose registry is the runtime and the
  build host beside it (`fef1fc36`, on `core/audit-runtime`).
- One writer for both the catalog and an npm user's directory: `scripts/image-directory.mjs`
  (`6ae5a22c`, on `core/audit-runtime`); regenerating `dist`'s catalog and four images'
  metadata gives the same bytes.
- `@daugasauron/dolly-build` (`scripts/dolly-build.mjs`): `from IMAGE NAME` prints a recipe
  (the base's host modules, its `FROM` row at the installed pin, its `ENTRY`);
  `Dollyfile-NAME OUT [--browser chrome|chromium|firefox]` serves the runtime, the base
  package and the new directory on 127.0.0.1 with isolation, builds in the headless browser
  with the catalog's own in-page build, checks the snapshot as the catalog does
  (`verifySnapshotIdentity`) and writes OUT: the base's catalog plus the image, the closure's
  metadata and recipes, the image's packs and metadata, `index.mjs`. Depends on the runtime
  and `playwright-core`.
- Docs: README "Your own Pi image" (an extension with `/hello` and a `changelog` skill as
  `FILE` rows), `docs/embedding.md` "Your own image", `docs/agent-frontend.md`; the review
  map (`docs/browser-boundary.md`) names `dolly-build`'s page beside the site's as a user of
  the builder.

Measured:

- `test/npm-browser.mjs` in Chromium and Firefox (`npmbuild2-npm-browser-*.log`): from packed
  packages and a registry of their own (with `playwright-core`), the README's blocks install
  `dolly-build`, write `Dollyfile-my-pi` with `from`, add the rows, build with the browser
  under test (`--browser chrome`, `--browser firefox`), boot `my-pi.html`: Pi lists
  `changelog` under `[Skills]` and `hello.js` under `[Extensions]`, `/hello` answers "Hello,
  world, from my-pi!", and the page has exactly `pi-minimal`'s modules. In Firefox, Enter
  first took a stale entry of Pi's command menu; the test waits for the menu to offer the
  command.
- Before `pi-minimal` held the engine, `FROM default` from packages packed into a
  `node_modules/@daugasauron/` of their own (`build/audit-runtime-evidence/fake/`): a `FILE`
  row built in Chrome (sandboxed, headless) and in Firefox gave byte-identical directories
  (7.6 MB), which `boot()` ran in both browsers.
- Installed with pnpm 12 and Yarn 1.22 from the same registry
  (`repro/pnpm-dolly-build.mjs`, `layout-*.log`), `npx dolly-build` prints the recipe and
  builds it. Under pnpm it first found no image package: it looked beside its own real path,
  where pnpm keeps only its dependencies; it now reads the working directory's
  `node_modules/@daugasauron/`, and copies the base from its real path.
- `default-browser`, `amy-browser`, `core-browser` and `image-inventory-browser` in both
  browsers, `image-browser` and `custom-session-browser` in both for the builder's
  registry; source suite 447 pass.

Not done: `SOURCE` rows of files beside the recipe (a `FILE` body is at most the recipe's
128 KiB); `INSTALL` of a package the image package does not ship. Both would need the
command to serve and pin more than the base package holds.

## For the owner

- `pi-minimal` now holds the recipe engine (134 KB), so that it can be built `FROM`.
- `amy` installs the `dollyfile` package rather than exporting `/bin/dollyfile` itself; an
  image's files do not change, its record (`/etc/dolly/installed`) lists `dollyfile`.

## Lessons

- Build where the guarantees already are: the catalog's in-page build, given the runtime's
  URL apart from the image directory's, built an npm user's image with no change to the
  runtime, the kernel or the recipe language. What the command adds is serving and writing
  files; Chrome and Firefox gave byte-identical directories.
- A rule in a test can carry the design: `dollyfile-catalog.test.mjs`'s "an image with amy
  records the packages its base holds" turned "amy keeps its own export" into "amy installs
  the package", one exporter of the engine instead of two.
- An interactive check needs the state it acts on, not only the screen it starts from: in
  Firefox, Enter reached Pi before its command menu showed the typed command and took a
  stale entry; the test now waits for the menu to offer it.
