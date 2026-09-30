# Give quarry terraces clearer vegetation and rock layers

- STATUS: OPEN
- PRIORITY: 20
- TAGS: game,graphics

The raised quarry fills a large part of the view with nearly uniform brown-gray
stone. Separate sparse green growth on horizontal terraces from warm sediment
and dark mineral seams on vertical faces. Keep exposed ledge edges and the matte
late-90s style. This is a generic terrain-material shader, with no collision or
actor-program changes.

Prepared comparison: `build/slopyard-quarry-colors/{before,after}.wgsl` and
`browser.mjs`. Render identical saved-world views in Chrome and Firefox, inspect
the quarry and other shared rock surfaces, and measure the existing populated
rendering sample. Keep the shader unbundled until the comparison supports it.

## Chrome comparison (2026-10-01)

The earlier `build/slopyard-quarry-colors/` candidate was gone, so a new one was
made. Candidate for the `style 8` quarry rock in `demos/slopyard/src/scene.wgsl`:

```wgsl
}else if(b.style.x==8){
    if(normal.y>.5){
        let growth=smoothstep(.62,.84,noise(floor(position.xz*.8)*.23));
        color*=.80+.14*noise(floor(face_uv*6)/3);
        color=mix(color,vec3f(.27,.37,.19),growth*.7);
    }else{
        let strata=.5+.5*sin(position.y*5+noise(floor(position.xz*2)*.11)*5);
        color*=.65+.18*noise(floor(face_uv*8)/3)+.17*strata;
        color=mix(color,vec3f(.50,.37,.24),.28*strata);
        let seam=abs(sin(position.y*2.3+noise(face_uv*.25)*2.5));
        color=mix(color,vec3f(.10,.10,.11),.55*(1-smoothstep(.02,.07,seam)));
    }
}
```

Terrace tops get sparse blocky green growth (about a fifth of the surface);
walls get warm sediment bands with thin dark seams along the layers. A first
try that darkened the existing vein pattern made isolated rings on the thin
terrace walls, like bolt holes; seams that follow `position.y` do not.

Method: the game reads `/usr/src/dolly/slopyard/scene.wgsl` at start, so a
live session can compare shaders without an image rebuild. A check script run
by `slopyard --integration-check` switches to the world view, sets the camera
(west quarry at -76,13,-70; the same from above; east terraces at 73,9,-66) and
writes `Game.call('snapshot')` PNGs. Chrome ran headed on the private Xvfb
display (headless software WebGPU fails with "Slopyard GPU: I/O error"). Frame
counters in the snapshots: 70 before and 69 after on the west quarry view.
Firefox on Xvfb provides no GPU adapter, so the Firefox half of the
comparison is still missing. Evidence, patch and scripts:
`build/evidence/slopyard-quarry/` (local).

Still required: the Firefox comparison and the populated rendering sample; then
apply the patch, update the slopyard pins and rebuild the image.
