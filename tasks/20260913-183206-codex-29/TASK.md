# Share pinned Git fetching and preserve caches during overlapping preparation

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: audit,bug,build,cleanup

## Evidence

Thirteen Git-source fetch scripts repeat the same init/fetch/checkout/publication
and verification logic. Pi alone used a filtered full clone for the same pinned
checkout result. Their plain `mv` publication can move one completed temporary
checkout inside another already-published checkout.

A real local Git origin and four simultaneous invocations of the original sbase
fetcher reproduced this on the first attempt: all four exited 1 and the cache
contained three `sbase-fetch.*` subdirectories. The source verifier then rejects
that polluted cache on subsequent builds. The original user caches were not used
or changed for the probe.

## Done when

- Use one pinned Git checkout helper and remove the duplicate fetch implementations.
- Preserve source URL/commit pins, existing cache directory names and exact source validation.
- Publish only verified temporary checkouts; overlapping fetches must not nest, overwrite or dirty the published cache.
- Exercise cold/warm fetching, concurrent publication, and corrupted/staged/untracked source rejection using real Git.
- Measure normal default/Pi preparation and confirm byte-identical source archives and full image reuse.

## Result

One `fetch-pinned-checkout.sh NAME` now owns all pinned Git fetching. The thirteen
old implementations are removed. It preserves existing source pins and cache
names, including QuickJS/Pi naming and Emscripten's sparse library checkout.
Candidates are verified before a no-clobber directory rename, then the published
checkout is verified. Simultaneous losers discard only their own temporary
checkout and use the verified winner; no lock/cache framework was added.

The real Git regression completes four overlapping cold fetches successfully,
leaves exactly one clean cache, reuses it without changing source mtime, rejects
working-tree/staged/ignored modifications and bad names, and cleans up a failed
fetch of an unavailable commit. Existing prepared-key relocation checks pass.
A truly cold fetch from the pinned upstream Pi repository completed in 1.671 s
with all 1,410 tracked files at b79e4cc834970cca69daebffab7df1da7d1e52c4.

The full default/Pi commands initially took 6.12 s / 6.06 s while refreshing the
changed preparation keys, reusing all nine/thirteen image artifacts. A subsequent
warm default run took 3.97 s (2.1 s source preparation). All 123 static files
remain byte-identical and all 28 selected artifact checks pass. All 285 source
checks pass. No runtime, compiler seed or image was rebuilt for this cleanup.
