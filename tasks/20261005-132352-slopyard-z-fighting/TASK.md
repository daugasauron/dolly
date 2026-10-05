# Slopyard: coplanar ground surfaces flicker (z-fighting)

- STATUS: OPEN
- PRIORITY: 40
- TAGS: game,slopyard,rendering

Owner (2026-10-05): "in slopyard when two surfaces are on the same 'plane' like
some ground have dirt and tiles, they flicker between the two. This is a low
priority task for now."

Two surfaces at the same height fight for the depth buffer. Fix where the
world places them (one surface per patch of ground) or give decals a defined
order in the renderer (`demos/slopyard/src/render.c`); a depth bias tuned by
eye is the last resort.

## Done when

- A capture of a dirt-and-tile patch is stable from frame to frame while the
  camera moves, shown by a test or recorded evidence.
