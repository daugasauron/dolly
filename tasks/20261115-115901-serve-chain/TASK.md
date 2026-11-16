# serve-checkout keeps its snapshot chain from start: 404 after an image build

- STATUS: OPEN
- PRIORITY: 140
- TAGS: dev,0.1.8

## State (2026-11-16, the audit)

Not started: `scripts/serve-checkout.mjs` has not changed since `9ce25c018` (2026-11-14), and it
still reads the image's chain once at start (`:21-32`).

`scripts/serve-checkout.mjs IMAGE` serves IMAGE's snapshot chain as it was when the server
started. After an image build in the same tree, the page asks for the new chain's packs and gets
404 ("snapshot returned HTTP 404"): the owner met it on 2026-11-15 at 18:00 on
`http://127.0.0.1:9048/godot-voxel-flyover/`, after a 17:39 build of Voxel Flyover; a restart
fixed it. The server should follow the checkout's current chain, as it follows its other files.

## Done when

A build while the server runs is served on the next reload, with no restart.
