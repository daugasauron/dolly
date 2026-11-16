# Voxel Flyover 7: black frames in Chrome on the AMD GPU (a power of a negative number in the sky)

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`. Found on 2026-11-16 by the image's test in Chrome on the integrated AMD GPU, which failed twice in five runs with `FLYOVER frame 1920x1080 sky 0 colours 19` (and once the evening before, its output then not kept).

## What it was

In Chrome on the AMD GPU (not in Firefox on it, not on the NVIDIA card) the game drew frames whose every lit thing was black, some ten moments in a flight of 20 seconds, each for a few frames: one frame before, black specks on windows and road markings; with the glow, a white bloom from them. Present before the night's work too (the game of `e25b5299b` shows it the same).

Reproduce: `build/flyover4/amdc.sh NAME 20 0.2` (Chrome on the AMD GPU, a still every 0.2 s, counts the stills that are mostly black or white): 11 of 94.

## Cause

`sky.gdshader`'s `sunward` (how far a direction is toward the sun, around the horizon) is `0.5 + 0.5 * dot(...)` of two normalised vectors, which rounding puts a hair under 0 for the direction opposite the sun; the sunset's band takes `pow(sunward, 5.0)`, and a power of a negative number is no number there. A texel of the sky's radiance map got it, the map's filtering spread it, and every pixel lit or fogged by the map was no number: black. Found by elimination, each a run of the reproduction: not the glow alone, the sea, the buildings, the landmarks, the thermals, the land's shading; gone with a constant colour in the radiance pass; gone with `sunward` clamped.

## Fix

`sunward` is clamped to 0..1. The two other powers whose base could round under 0 (`trees.gdshader`'s rim, `city.gdshader`'s upturned eaves) take `max(..., 0.0)`.

## Closed (2026-11-16, 03:12)

Fixed. In the image built at 03:01 the game's test passes in all four (Chrome and Firefox on the NVIDIA card, both on the AMD GPU), and the read-back of every frame of the fixed flight in Chrome on the AMD GPU gives 13 tiles of sudden change in 7 frames and 7 events of 8 tiles or more, as Firefox on that GPU gives (6,155 tiles in 210 frames and 42 events before the fix).

## Closed (2026-11-16, 05:32)

Fixed (closed at 03:12, commit e65f96bdf). Checked again on the night's last game (`0b79b7786`) from dusk into night: 0 of 77 stills in 20 seconds of Chrome on the AMD GPU are black or white, and the image's test passed there in each of the six runs since the fix (it had failed in two of five before).
