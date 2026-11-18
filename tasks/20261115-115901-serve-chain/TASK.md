# serve-checkout keeps its snapshot chain from start: 404 after an image build

- STATUS: CLOSED
- PRIORITY: 140
- TAGS: dev,0.1.8

`scripts/serve-checkout.mjs IMAGE` serves IMAGE's snapshot chain as it was when the server
started. After an image build in the same tree, the page asks for the new chain's packs and gets
404 ("snapshot returned HTTP 404"): the owner met it on 2026-11-15 at 18:00 on
`http://127.0.0.1:9048/godot-voxel-flyover/`, after a 17:39 build of Voxel Flyover; a restart
fixed it. The server should follow the checkout's current chain, as it follows its other files.

## Done when

A build while the server runs is served on the next reload, with no restart.

## Closed (2026-11-17)

`scripts/serve-checkout.mjs` listed `dist/packs/` once at start, so a pack a later build wrote was
"not served". It now serves any `dist/packs/SHA256.snapshot.gz` the checkout holds, and reads the
registry's paths (pages, recipes, sources, metadata) again whenever a build rewrites
`dist/dolly-images.json`. No image rebuilds: the server is not an image input.

Checked in `work/speed` (`work/audit-1116-evidence/buildtime/fix-speed/serve-chain-check.txt`): the
old and the new server of fingers started together; after a build of fingers with a changed
recipe the old one's page stopped at "snapshot returned HTTP 404", the new one's loaded the new
pack and was ready on the reload, and again after the recipe was restored.
`demos/fingers/test/fingers-browser.mjs` passes in Chromium and Firefox.
