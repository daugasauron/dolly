# truck-town and dodge-the-creeps are not published, though the showcase and Godot's README install them with amy

- STATUS: CLOSED
- PRIORITY: 140
- TAGS: audit,recipes,amy,godot,site,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`).

## Closed (2026-11-19)

On the 0.1.8 round's images (`integrate/0.1.8` at 8d666a4e4, which rebuilt the Godot chain), on
`fix/rc-recipes`: the domain catalog's `amy-index.txt`, generated as `package-pages.sh` generates
a release's (`generate-routes.mjs SITE` with `DOLLY_BUILD_IMAGES` set to
`config/domain-pages-images.txt`), has 202 packages, `truck-town` and `dodge-the-creeps` among them.
Each installed alone with `amy` into a fresh `default` session and ran `godot --version` and
`GAME --headless --quit`: truck-town in 4.6 s and dodge-the-creeps in 3.9 s in Chromium, 7.5 s and
15.0 s in Firefox (`build/rc-recipes-evidence/godot-games-browser.mjs`, `godot-games.log`,
`domain-amy-index.txt` in `work/rc-recipes`). The round's `godot-editor-browser.mjs` installs
dodge-the-creeps with amy too and passed in both. The release candidate's packaging serves these
same snapshots; its checklist confirms them as served.

## State (2026-11-17)

Fixed on `ws/recipes` (f66240630): `config/domain-pages-images.txt` lists `truck-town`,
`dodge-the-creeps` and `fingers` (an application of 12.7 MB with its own test, which a phone can
open); `demos/llvm/README.md` says the site does not publish `llvm-runtimes`, the comparison a
checkout runs; `pi-minimal` is npm's (`config/npm-images.txt`). The domain catalog's closure,
as the image builder selects it (`work/audit-1116-evidence/recipes/ws-recipes/domain-packages.mjs`):
228 images and 169 packages, against 224 and 165 in 0.1.7's tree; the four more are
`truck-town`, `dodge-the-creeps`, `fingers-build` and the new `x11-libs`
(`tasks/20261116-141504-recipes-04`).

Left for the 0.1.8 round, which rebuilds the Godot chain (python's change reaches scons): its
packaged release's `amy-index.txt` lists the two, and `amy install truck-town` works on its `npm
run serve`. Rebuilds: none by itself (a catalog list).

## Found

The release publishes `config/domain-pages-images.txt` and what those images read
(`docs/deployment.md`, Package and export). Six images of the catalog are reached by neither:
`truck-town`, `dodge-the-creeps`, `fingers`, `fingers-build`, `llvm-runtimes` and `pi-minimal`
(`work/audit-1116-evidence/recipes/references.txt`, last line). The checkout's `amy-index.txt` lists
169 packages, the sealed release's 165: without `dodge-the-creeps`, `fingers-build`,
`llvm-runtimes` and `truck-town`, and its `dist/` holds no snapshot of them. Every full round builds
all six anyway (`work/round1113/build/round-1117*`, packaging: dodge-the-creeps 18.5 s, fingers-build
8.9 s, fingers 4.6 s, llvm-runtimes 38.1 s, pi-minimal 19.7 s, truck-town 21.1 s).

Two of them are offered to visitors of the site:

- `sites/slopshare.dev/agents/index.html:80`: "A script installs Truck Town with amy, starts it and
  drives." `https://slopshare.dev/v0.1.7/amy-index.txt` (read 2026-11-16) has 165 rows and none for
  `truck-town` or `dodge-the-creeps`, so `amy install truck-town` there ends in amy's "publishes no
  such package".
- `demos/godot/README.md:22`: "as it exported Dodge the Creeps for `amy install dodge-the-creeps`".

Both install and run in a session served from the full catalog (`run-a.jsonl`/`run-b.jsonl`:
`truck-town` and `dodge-the-creeps` install godot, `--version` and `--headless --quit` exit 0).
`pi-minimal` is npm's (`config/npm-images.txt`); `fingers` has its own demo test; `llvm-runtimes`
is the LLVM demo's proof that Dolly compiles the runtimes as the seed's are.

## Do

Add `truck-town` and `dodge-the-creeps` to `config/domain-pages-images.txt` (about 11 MB of
snapshots; Godot itself is published already). For `fingers` and `llvm-runtimes`, either list them
too or say in their READMEs that the site does not publish them.

## Done when

A packaged release's `amy-index.txt` lists `truck-town` and `dodge-the-creeps`, and
`amy install truck-town` works on its `npm run serve`.
