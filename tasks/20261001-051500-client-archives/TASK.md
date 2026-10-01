# Client archives keep members of earlier builds, so the seed depends on build history

- STATUS: OPEN
- PRIORITY: 305
- TAGS: bug,build,reproducibility,core

`scripts/build.sh` adds each module's client object to `build/libdolly-NAME.a`
with `emar r`, which keeps members an earlier build left there. The released
seed (image inputs `6efbcb13…`, release `516741bf…`) therefore ships:

```
libdolly-runtime.a: process-runtime-adapter.o process-runtime-client.o
libdolly-threads.a: threads-client.o process-threads-client.o
```

`process-runtime-adapter.o` and `threads-client.o` are stale copies from before
the host module move. A fresh clone builds archives with one member each, so
its seed, image inputs and every image identity differ from the release.

## Evidence

Measured 2026-10-01 on `takeover-20260930`: building the archives fresh changed
only `/seed/usr/lib/dolly/process/{libdolly-runtime.a,libdolly-threads.a,SHA256SUMS}`
(seed diff against `build/releases/516741bf…/dist`) and the image inputs to
`1468ea41…`. `ar t` lists the members above.

## Expected

Each archive holds exactly its module's current client objects, independent of
what `build/` contained before.

## Done when

- `build.sh` creates each archive fresh (drop the `cp -p` that preserves the old
  members, next to this task's reference in `scripts/build.sh`).
- The catalog is rebuilt against the new image inputs, and a build from a fresh
  clone reproduces the release's image inputs.

## Progress (2026-10-01)

`3d34aa6` creates each archive fresh; the catalog was rebuilt against the new
image inputs (`74246d78…`), and a parallel rebuild in a separate worktree
reproduced all 40 buildable images byte for byte. Left: a build from a fresh
clone (not a worktree seeded from this checkout's build/) reproducing the
image inputs.
