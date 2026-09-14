# Preserve the complete deployed image catalog and rebuild links

- STATUS: OPEN
- PRIORITY: 200
- TAGS: images,bug,checkpoint

The checkpoint at localhost:9098 was packaged with a restricted selection of
21 images. The deployed daugasauron.com release `cc12357d`, source `ff633f7`,
has 32. All original recipes remain in this branch. Sixteen artifacts still
used the older seed identity and must be rebuilt before publishing the full
preview. Build-only menu rows also replaced the explicit rebuild link.

Completion requires all 32 deployed images plus the six compiler/library bases
and fluid, open/rebuild/Dollyfile links on every row, working rebuild controls,
and verified artifacts for all 39 images. Keep Agents at play in the domain
variant. Package with `DOLLY_BUILD_IMAGES=all`; do not merge or deploy to main.

Comparison inputs: `build/deployed-index.html`, `build/deployed-images.mjs`,
and `build/deployed-source.commit`, downloaded from daugasauron.com.

Chrome 151 checked all 117 open/rebuild/Dollyfile links, started and cancelled a
Rust builder through the restored rebuild link, and confirmed that the old demo
route returns 404. All six new compiler/library bases appear below the build
heading. Browser evidence: `build/catalog-browser.json` and
`build/catalog-restored.png`. The full image rebuild is still in progress.
