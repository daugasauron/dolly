# A custom image with snapshot@0 and no http@0 fails with invalid custom session base

- STATUS: CLOSED
- PRIORITY: 220
- TAGS: bug,sessions,host-modules

Found while measuring direct-ENTRY images
(`20261005-222449-single-program-images`; release build `5439ebe7`, headless
Chrome, 2026-10-06).

## Reproduce

On `/custom/`, build this recipe and open the result (pins as in
`Dollyfile-minimal`):

    DOLLY 6
    APPLICATION no-network
    REQUIRES HOST runtime@0
    REQUIRES HOST display@0
    REQUIRES HOST snapshot@0

    INSTALL https://daugasauron.com/Dollyfile-core PIN
    INSTALL https://daugasauron.com/Dollyfile-display PIN
    ENTRY /bin/foreground -i /bin/slop

The build succeeds. The result tab stops before ENTRY with `FATAL invalid
custom session base`. With `REQUIRES HOST http@0` added the same recipe runs,
saves and restores. Catalog images are not affected: only a custom image's
identity goes through this check, and all 19 images that declare `snapshot@0`
also declare `http@0`.

## Cause

`host/snapshot/ui.mjs:200` computes the session identity of a custom image
when ENTRY starts. `customSessionIdentity` (`src/session-store.mjs:23-34`)
demands 1 to 16 `policies`. That record is what `http@0` hands a result tab
(`host/http/http.mjs:47`, merged at `src/browser.mjs:180`), so without
`http@0` there is none.

## Neither a lint rule nor a manifest dependency

`snapshot@0` uses nothing of `http@0`: its manifest depends on `runtime@0`
only and its code never asks for the module. The policies are part of the
identity so that a restored session cannot run under a wider network policy
than the tab that saved it. An image without `http@0` has no network edge and
nothing to bind. A dependency would make every image that saves sessions
declare the network; a lint message would turn the accident into a rule.

## Fix (2026-10-06, `fix/session-policies`; not yet run in a browser)

A bug in how the session base is checked, not a dependency.
`customSessionIdentity` repeated, for every custom image, a check that
belongs to `http@0` and that `http@0` already makes: a tab opened from
another must carry valid policies or the module refuses it, failing closed
(`restrictDollyHttpPolicy`, `host/http/policy.mjs:278`, called at
`host/http/http.mjs:42`). The identity string itself never included them
(`custom:RECIPE:ARTIFACT`).

`src/session-store.mjs` now checks `policies` only when the record has them
(1 to 16, 64 KiB, as before). An image without `http@0` has none and its
session is valid; an image with `http@0` whose record lacks them is still
stopped before ENTRY, by `http@0`, with `Invalid inherited image HTTP
policy`. Nothing has to be added to the recipe, so no message names a line;
the manifest of `snapshot@0` stays `runtime@0` only and the core file names
no module.

Checked without a browser: `node --test test/session-file.test.mjs` (a
record without policies round-trips and is compatible; an empty or oversized
list is still refused). To run:

    node test/session-offline-browser.mjs chromium firefox
    node test/custom-session-browser.mjs chromium firefox

`test/session-offline-browser.mjs` builds `core` and `display` with
`runtime@0`, `display@0` and `snapshot@0`, saves a session and restores it.

## Done when

- The recipe above saves and restores a session in Chrome and Firefox
  (`test/custom-session-browser.mjs`).
- A custom image that declares `http@0` and carries no policies is still
  refused.

## Closed 2026-10-07

`fix/session-policies` (`ef994618`) is in the candidate.
`test/session-offline-browser.mjs` (a page-built image with `runtime@0`,
`display@0` and `snapshot@0` only, saved and restored) and
`test/custom-session-browser.mjs` passed in Chromium and Firefox in the main
round (`work/next/build/next-evidence/browser-final/summary.txt`,
`round-3.log`). The refusal of an inherited page without valid policies stays
`http@0`'s (`restrictDollyHttpPolicy`, `host/http/policy.mjs`), exercised by
`test/fixtures/browser-boundary.mjs` in the `boundary` suite and by
`test/http-policy.test.mjs`.
