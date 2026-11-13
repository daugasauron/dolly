# The directory says what a file is: kernel, process, page, site, programs

- STATUS: OPEN
- PRIORITY: 150
- TAGS: architecture,core,hygiene,audit,0.1.6

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, A6, A7; 2026-11-07 S1, S3, S4, standing).

## State (2026-11-13, seed round)

Applied on `round/0.1.6-seed` from main `e6ad7707c` with the seed hygiene merged: the move
`15037f809` (`e02a407c5`'s message), the picks `fb0b421ce` (route attributes), `56d202d1c`
(docs), `40aa607da` (`page/generated.mjs`), pins `94c19243f`. The script stopped on main's new
kernel files as it should (`src/pty.c`, `src/pty-kernel.h`, and a comment in
`scripts/bundle-process-worker.mjs` naming `src/`); its copy
`/home/daug/dev/dolly/work/seedbatch/build/src-layout/apply.mjs` puts them in `kernel/` and
rewrites the comment to `page/` (135 files move, 326 change, 584 references). The picks applied
without conflicts; main's new tests and pages set no `DOLLY_HOST_MODULES`, `DOLLY_HTTP_POLICY` or
`DOLLY_HTTP_RELAYS` (grep), and import no generated module but through `page/generated.mjs`.
Image inputs `98bc4c57…` before, `e855bf8c…` after. Suites: in the seed round's report
(`tasks/20261112-074503-abi-contracts`, the same build).

## State (2026-11-13)

Done on `fix/src-layout`, waiting for its merge after the branches that land first. `src/` is gone:

| Directory | What it holds |
| --- | --- |
| `kernel/` | The Wasm kernel, linked into `dist/dolly.wasm` (`dolly.c`, `process-kernel.c/.h`, `system-snapshot.c/.h`, `file-blocks.cpp`, `libc-host.c`, `device-lease.c/.h`) and the record formats it owns (`fs-record.h`, `session-records.h`), which `programs/dollyfile.c` and `session-recover` compile beside them in the seed |
| `process/` | The process-side runtime every program links: libc adapter, runtime adapter, signals, mmap, poll, time, stubs, `crt1.c` |
| `page/` | `boot()`'s files: the trusted page and Worker code a page loads (`browser.mjs`, `runtime-worker.mjs`, `worker-image.mjs`, the supervisor and process Worker, the pack store, image loading, `generated.mjs`) |
| `site/` | The site's own: routes (`route.mjs`, `route.css`, `icon.svg`, `site.mjs`), image builder, sessions, custom images, Dollyfile view |
| `programs/` | Guest programs Dolly builds: Slop, `commands/`, the Dollyfile engine and `sha256.h`, the compiler driver (`compiler.cpp`, `compiler-main.c`), `bootstrap.c`, `zig/`, `ghostty/` |
| `test/fixtures/` | Gains the ten process probes (`process-check.c`, `cpp-check.cpp`, `fs-check.c`, ...) only the build and the tests compile |

Decided: the pack store is `boot()`'s (every image start reads it, `docs/embedding.md`), so it is in
`page/`, not `site/`; Ghostty's plugin and Zig's sources are built by recipes, so `programs/`. The
npm runtime's entry is `@daugasauron/dolly/page/browser.mjs` from 0.1.6; its import closure is the
same 73 files renamed (compared before and after the move), and `page/generated.mjs`; every import
in the packed runtime resolves inside it. Data Pi keeps `./dolly/src/browser.mjs`: it depends on
the published 0.1.5.

Commits: `e02a407c5` the move, made by `/home/daug/dev/dolly/work/src-layout/apply.sh` (outside
git); `7a2129480` the route's host modules, HTTP policy and relays from `data-modules`,
`data-http-policy`, `data-http-relays` (no globals; a test writes them on the route page's main
element before its script runs, `routeAttributes` in `test/browser.mjs`; `buildImageInPage`
takes its policy as an argument); `94a809771` the directories in `docs/architecture.md` and the
boundary's trusted files; `51e87eaa7` the build's generated modules imported from
`page/generated.mjs` alone (14 files imported `dist/` each; the custom page and source links read
the catalog through `images.mjs`; the build writes the identities before it bundles the process
Workers); `9df83721d` recipe pins.

On a later checkout: `/home/daug/dev/dolly/work/src-layout/apply.sh CHECKOUT` (a clean tree; it
refuses a dirty one, fails before moving anything on a `src/` file without a destination or a
reference it does not recognise, stages the result, and changes nothing on its own result), commit
it with `e02a407c5`'s message, `git cherry-pick 7a2129480 94a809771 51e87eaa7`, then
`DOLLY_BUILD_IMAGES=dolly-docs node scripts/update-recipe-pins.mjs --sources` and the image round,
which pins the staged sources, for the pins commit. Checked on a clone of `3cbd616b5`: the script
gives `e02a407c5`'s tree exactly, the three picks apply, and the result differs from the branch
only in the eleven recipes the image build pins (amy's source).

Image inputs: before `sha256:46de2b9c…` (runtime `9707352e…`), after `sha256:18a202ae…` (runtime
`7220f6ae…`): the seed's `dollyfile.c` names `site/dollyfile-view.mjs` now. The default closure
rebuilt (`DOLLY_BUILD_IMAGES=default,system`, 1,269 s, `build/srclayout-image-1.log`).

Evidence, logs under the tree's `build/`: `npm run -s build:runtime` (`srclayout-runtime-3.log`);
`npm run -s test:source`, 474 of 474 (`srclayout-source-4.log`; the documentation test again
once `page/generated.mjs` was tracked); `node scripts/package-npm.mjs` into scratch
(`srclayout-npm-2.log`). Browser suites, each in Chromium and Firefox, passed: core, process,
shell, Slop, pty, console, threads, terminal, cpp, host modules, display, upload, embedding, image,
custom session, and network (`srclayout-suites-1/`; those that set a policy, modules or relays
again with the final helper in `srclayout-suites-3/`, `-4/`, `srclayout-pty-rerun.log`,
`srclayout-image-rerun.log`). Three failed once with a load average of 16 to 20 and passed alone:
process (the lifecycle probe's process count, `srclayout-process-rerun-*.log`), host modules and
custom session (a custom rebuild's boot past its 30 s wait), pty in Firefox likewise. Not passed
for the catalog alone, which holds only the default closure: default (`amy install python`), site
(`docs/` is served as dolly-docs' sources), csp (the `html` package), nena (`libdolly-audio`),
gpu-explicit and gpu-render (`libdolly-gpu`, not run).

Left: `host/modules.mjs`'s `framePoint` (not in Do: input@0 and touch@0 share it through the
registry, with the display's surface size). An unbuilt checkout still cannot import the supervisor:
the identities come from one module now, not yet as values the page injects (audit S4's fix).
`demos/llvm`'s pins of `compiler.cpp` and `compiler-main.c`, whose comments name the new paths, are
refreshed by the next compiler round. The full catalog's suites (default, site, csp, nena, gpu)
run in the round that merges this.

## Found

`src/` holds the kernel, the page, the site's builder, session store and pack cache, and 48 guest
programs; `host/build`, `host/packages` and `host/snapshot` import the site's files; 15 runtime
sources import `dist/`, so an unbuilt checkout cannot import the supervisor; `host/modules.mjs`
holds canvas geometry; `src/route.mjs` reads `globalThis.DOLLY_HOST_MODULES`, `DOLLY_HTTP_POLICY`,
`DOLLY_HTTP_RELAYS`, test hooks in the shipped page.

## Do

`kernel/`, `process/`, `page/` (boot's files), `site/`, `programs/`; generated modules imported
from one place; the route's module list and policy from its own `data-` attributes.

## Done when

A path says whether a file is perimeter, trusted page code, site code or a guest program, and the
suites pass.
