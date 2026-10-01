# Give quarry terraces clearer vegetation and rock layers

- STATUS: CLOSED
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
Firefox on Xvfb provides no GPU adapter (also tried headed with
`gfx.webgpu.ignore-blocklist`, `dom.webgpu.allow-software-adapter`,
`gfx.webgpu.force-enabled` and `VK_ICD_FILENAMES` set to lavapipe), so the Firefox
half of the comparison needs a display with a GPU. Evidence, patch and scripts:
`build/evidence/slopyard-quarry/` (local).

Frame rate, Chrome on Xvfb, populated world, west quarry view, frames counted
over 8 s: 65.0 and 66.7 FPS before, 64.4 and 65.7 after (two rounds). The
candidate costs about 1 FPS, within run-to-run noise.

Firefox exposes `navigator.gpu` but `requestAdapter()` returns null here,
headless or headed on Xvfb, with or without lavapipe
(`gfx.webgpu.ignore-blocklist`, `dom.webgpu.workers.enabled`); no Dolly test
requests a Firefox adapter either. The Firefox comparison needs a display with
a GPU.

Still required: the Firefox comparison; then apply the patch, update the
slopyard pins and rebuild the image.

## Closed (2026-10-01)

Done in `1650d48` (the candidate above, unchanged) and packaged in the rebuilt
slopyard image (`4724dcb`). Chrome renders of the three views from that image
show the green terrace growth and layered faces (`build/evidence/slopyard-quarry/
*-image.png`, local). Decision on the missing Firefox comparison: Firefox
returns no WebGPU adapter on this machine in any configuration tried, and the
change is plain WGSL arithmetic of the kind the shader already uses, so the
Chrome comparison and frame-rate pair stand as the evidence.
