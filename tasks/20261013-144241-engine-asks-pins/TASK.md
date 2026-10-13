# The engine asks for every pin it lacks; the page parses no recipe

- STATUS: OPEN
- PRIORITY: 260
- TAGS: core,dollyfile,boundary

Owner (2026-10-13): "I want to get the core right, Dollyfile syntax, host
modules/bridge, browser runtime etc. It should be as clean and small as
possible in order to be extensible. Think unix philosophy (this is a core
thing)." One issue of
[the reflection on the direction](../20261013-142800-direction/TASK.md)
([reflection](../20261013-142800-direction/reflection.md), section 4).

Done when: the page hands the engine bytes by pin for `FROM` and `INSTALL`
as it does for a package's rows, and reads an image's host modules from the
sealed artifact only; `src/dollyfile-view.mjs` and `dollyfile-graph.mjs` are
tools of the scripts, not code a page loads.

## As filed (2026-10-13, main `e330d782`)

- The page parses the recipe language in JavaScript to compute a build's
  closure and its trust set (`hostRequirements`, `from`, `entry`):
  `dollyfile-view.mjs` 317 lines, `dollyfile-graph.mjs` 125,
  `image-build.mjs` 98. A second parser whose output is a trust decision.
- The engine already drives a fetch-on-demand loop for `INSTALL` rows
  (`ROW_FIRST`, `src/dollyfile.c:1329-1350`), which `amy` obeys; a packaged
  image's modules are read from the sealed artifact
  (`src/runtime-worker.mjs:111`), a custom one's from the page's own parser
  (`src/browser.mjs:114`).
- Engine (seed) and page.
