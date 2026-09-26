# Give quarry terraces clearer vegetation and rock layers

- STATUS: OPEN
- PRIORITY: 220
- TAGS: game,graphics

The raised quarry fills a large part of the view with nearly uniform brown-gray
stone. Separate sparse green growth on horizontal terraces from warm sediment
and dark mineral seams on vertical faces. Keep exposed ledge edges and the matte
late-90s style. This is a generic terrain-material shader, with no collision or
actor-program changes.

Prepared comparison: `build/blockwalker-quarry-colors/{before,after}.wgsl` and
`browser.mjs`. Render identical saved-world views in Chrome and Firefox, inspect
the quarry and other shared rock surfaces, and measure the existing populated
rendering sample. Keep the shader unbundled until the comparison supports it.
