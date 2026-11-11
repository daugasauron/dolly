# The directory says what a file is: kernel, process, page, site, programs

- STATUS: OPEN
- PRIORITY: 150
- TAGS: architecture,core,hygiene,audit

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, A6, A7; 2026-11-07 S1, S3, S4, standing).

## State (2026-11-12)

Filed. Ranked below the modularity work, which moves code first.

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
