# snapshot@0 and build@0 are site code: host modules import site/, and 12 manifests do not name their files

- STATUS: CLOSED
- PRIORITY: 230
- TAGS: audit,core,host-modules,architecture,0.1.8

From the core audit of 2026-11-16 (`work/audit-1116`, source of `b09b1e243`). Related:
`20261112-074501-modules-modular` (the core naming modules); this is the other direction, a
module reaching outside its directory.

## Closed (2026-11-19)

The fix below is in the 0.1.8 integration (`902f85636`). On `fix/rc-core` (from `8d666a4e4`):
`manifest-files.mjs` prints no unnamed file and no import of `site/` from `host/`, only
`page/`, `host/*.mjs` and the runtime's files, as `host/README.md` allows;
`test/host-modules.test.mjs` passes (7/7). With the round `dolly-round-018k`'s images,
session-save, session-offline, custom-session and host-compute pass in Chrome and Firefox.

## Fix (2026-11-17), on `fix/module-files` (`d4763c72d`, on main `b09b1e243`)

- Every manifest names every file of its directory but itself and `abi.mjs`: a `files` field
  (the JavaScript `host` and `processWorker` import, input's `ring.h`, `snapshot.h`, threads@0's
  `client.c`, `pthreads.c` and `pthreads-start.S`). dso@0's fixture build moved into its
  directory (`host/dso/fixtures.mjs`, the `fixtures` row), so a dropped dso still drops its step.
- snapshot@0 owns `session-store.mjs` (database, 8 GiB limit) and `offline.mjs` (kept runtime);
  `site/sessions.mjs` and `site/session-file.mjs` import them from `host/snapshot/`, and the list
  page sorts the saves itself (`alphabetical.mjs` stays the site's).
- build@0 imports nothing of the site: `site/site.mjs` gives `run()` an `imageBuilder` (a
  Dollyfile's parse, the custom build, the tab that opens it), a page resource beside `site`;
  build@0's `check` refuses a page without one. The builder files (`image-builder`,
  `image-build`, `image-artifact`, `custom-image`, `dollyfile-view`) are the site's;
  `page/build-log.mjs` stays the page's. `ImageBuildService(inspect, run)` takes the parse.
- `test/host-modules.test.mjs` (a required boundary check) fails on an unnamed file, a named
  path outside the directory (a runtime's aside) and on JavaScript the page and Workers load of a
  module (the `host`/`processWorker` closure) importing beyond its directory anything but
  `page/`, `host/*.mjs` or a runtime's directory; checked against main's tree (fails) and four
  mutations (a site import, another module's file, an unnamed file, an outside path).
  `host/README.md` states that rule; the device-only rule stays the packager's.
- The npm runtime closure differs only by the move: `host/snapshot/{offline,session-store}.mjs`
  for `site/{offline,session-store,alphabetical}.mjs`.

Verified on round1113's dist and build by per-file links (`dist/dolly-abi.json` regenerated:
it holds the manifests): `npm run test:source` 472/472, `validate-browser` and the boundary's
node tests pass; Chrome and Firefox pass session-save, session-offline, custom-session,
session-unsaved, session-without-http, session-large-file, host-compute, image, site, core
and Studio's build@0 panel (`demos/studio/test/studio-browser.mjs`, Firefox through a copy
with `browser: "firefox"`; it ran with main's pins of the 13 recipes and 4 documents whose
pins this branch changes, as round1113 built them). `test/npm-browser.mjs` was not run: the
packager's code is unchanged and its runtime closure was compared instead. Logs and runners:
`work/audit-1116-evidence/core/fix-core02/`.

## Found

`host/README.md:3-4`: "A host module is one bridge between the Wasm userspace and the browser, in
one directory. Each `NAME/module.json` names every file of its module." The owner's rule
(2026-10-01, memory `host-module-architecture.md`): one directory and a manifest per bridge.
`work/audit-1116-evidence/core/manifest-files.mjs` lists, for each `host/NAME/`, the files its
manifest does not name and what its JavaScript imports from outside it (`manifest-files.txt`):

- Two modules import the site, which is a consumer of the core, not part of a module:
  - `snapshot@0`: `snapshot.mjs`, `transport.mjs` and `ui.mjs` import `site/session-store.mjs`
    (the session database and `DOLLY_SESSION_MAX_BYTES`, the 8 GiB of the review map's row), and
    `ui.mjs` imports `site/offline.mjs` (the kept runtime). The session store is the module's
    storage; `site/sessions.mjs` reads it.
  - `build@0`: `ui.mjs` imports `site/image-builder.mjs`, `site/image-build.mjs`,
    `site/image-artifact.mjs`, `site/custom-image.mjs` and `page/build-log.mjs`; `service.mjs`
    imports `site/dollyfile-view.mjs`. The module's own files are the panel and the reserved URL;
    the build is the site's.
- Five more import `page/` (`dso`, `http`, `packages`, `snapshot`, `threads`) and two
  `host/runtime/` or `host/requirements.mjs` (`nena`, `dso`): the README allows this for "the
  runtime's own machinery" (`host/README.md`, "also use the runtime's files"), which lists
  `snapshot` and `build` too, but `site/` is not the runtime's.
- 12 of 22 manifests leave out files of their directory: the JavaScript their `host` file
  imports (`http`: `broker.mjs`, `policy.mjs`, `local-services.mjs`, `refusals.mjs`; `gpu`:
  `bridge.mjs`, `worker.mjs`; `packages`: `service.mjs`, `transport.mjs`, `worker.mjs`; `audio`,
  `microphone`, `upload`, `runtime`, `dso`, `build`, `snapshot`), `input`'s `ring.h`,
  `snapshot.h`, and threads@0's `client.c`, `pthreads.c` and `pthreads-start.S`, which only
  `host/threads/seed.sh:37-39` names (`"client": []` although the module has a client);
  `pthreads.c` includes `../../process/lock.h`.
  Packaging is not affected: `scripts/package-npm.mjs:107` follows imports from the `host` file.
- One manifest names a file outside its module: dso@0's `"fixtures":
  "../../test/build-dso-fixtures.mjs"` (`host/dso/module.json:18`), the build script of its
  contract fixtures, which lives in `test/` (runtime@0's `../../kernel/` and `../../abi/` paths
  are the runtime's own, `host/README.md` "Runtimes").

What it costs: `snapshot@0` cannot be delivered or reviewed without the site's files. npm
packaging enforces the rule only for device modules (`scripts/package-npm.mjs:107-109` throws
"imports outside its directory"); the "runtime's own machinery" (`:46`, snapshot and packages
among it) ships inside `@daugasauron/dolly`, whose import closure therefore carries
`site/session-store.mjs` and `site/offline.mjs`. A reviewer reading a manifest does not see the
module's code, and the README's one-sentence rule is false for most modules.

## Do

- Move `site/session-store.mjs` and `site/offline.mjs` into `host/snapshot/`; the site's
  sessions page imports them from there.
- build@0: its panel takes the builder from the page (a resource beside `site`, as `boot()` gives
  `mount`), or `host/README.md` says build@0 is the site's module and why.
- `host/README.md:4` says what a manifest names (its entry points; the rest is what they import),
  or the manifests list every file; threads@0's manifest names its client and threaded libc.

## Done when

`manifest-files.mjs` prints no import of `site/` from `host/` (a check as `package-npm.mjs`'s,
allowing `page/` and `host/*.mjs` for the runtime's machinery, holds for every module but a
build@0 the README calls the site's), and the README's rule matches what it prints; the session suites (`session-save`, `session-offline`, `custom-session`) and the
Studio build (`host-compute-browser`) pass in Chromium and Firefox.
