# Local image build service is ambient for every HTTP image

- STATUS: CLOSED
- PRIORITY: 280
- TAGS: security,boundary,core

`src/browser.mjs:567-569` wires `{ build }` into the network of any image with http@0
(`src/local-services.mjs:12-17`), and `Dollyfile-system:7` gives http@0 to every system-derived
image. One POST to `build.dolly.invalid/v1/builds` lets Wasm start a second kernel (<=8 GiB, 45
min), persist multi-GiB artifacts in IndexedDB under `custom:<IMAGE>` slots
(`src/image-builder.mjs:241-243`) and evict same-slot entries
(`src/image-artifact.mjs:270-277`), breaking restore of custom sessions
(`docs/sessions.md:96-98`). Neither `DOLLY_HTTP_POLICY` nor `DOLLY_HOST_MODULES` can disable it
while keeping HTTP. `docs/security.md:49` says there is no guest storage API. Suspected: cached
descriptors take priority over published digests (`src/image-build.mjs:65`), so a byte-identical
recipe submitted from Wasm writes the id later rebuilds reuse (only matters for non-hermetic
builds).

## Evidence

Established: CONFIRMED BY READING. Wiring verified at `src/local-services.mjs:12-17` and
`src/browser.mjs:569`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Running an image and building images are separate authorities. Only images that explicitly
require a build capability (Studio) can submit builds; other images get EACCES.

## Done when

- Browser check: `curl -X POST https://build.dolly.invalid/v1/builds` from the default image is
  denied and no build starts; Studio still builds and opens its result.
- Docs (`security.md`, `browser-boundary.md`) describe the build capability and its storage
  writes.

## Resolution (2026-10-01)

Fixed: the build service is its own host module, `build@0`, declared only by
Dollyfile Studio and admitted after ENTRY starts
([`host/build/`](../../host/build/module.json)); the default image's HTTP never
reaches it. Verified by `test/core-browser.mjs` (a POST to `build.dolly.invalid` from the
default image fails) and the Studio demo test
(`demos/studio/test/studio-browser.mjs`), passing in Chromium.
