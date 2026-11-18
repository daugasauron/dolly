# Deep hedger's tree: the plain image build stops at the Go seed

- STATUS: OPEN
- PRIORITY: 70
- TAGS: dh,build

`work/dh` (branch `feature/deep-hedger`) was made with the released catalog's images hard-linked
into `dist/`. Its catalog is narrowed to `deep-hedger`, `default` and `mojo-gpu`, which is what
`DOLLY_BUILD_IMAGES=deep-hedger,default,mojo-gpu npm run image` leaves.

## State 2026-11-17

`npm run image` without a selection, run twice on 2026-11-17, does not finish there: it stages
every image's sources again (about 5 GB in `build/` and `dist/.image-sources.*` while it runs;
the first run was stopped at 12 GB free on `/home`) and then stops with "dolly: no verified Go
seed: run demos/go/build-go-toolchain.sh once, then retry the image build". What the runs left
in `build/` was removed.

For whoever merges: the demo's two recipes are pinned and build from a cache hit of `mojo` and
`imgui` in under a minute; the whole catalog has to be regenerated in a tree that has the Go
seed.
