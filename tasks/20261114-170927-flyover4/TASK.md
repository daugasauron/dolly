# Voxel Flyover 4: smooth everywhere, mouse look, a pelican on a bicycle

- STATUS: OPEN
- PRIORITY: 300
- TAGS: godot,demo,0.1.7

Owner (2026-11-15): "I want to have a fable 5.2 agent work on improving the godot-voxel-flyover
image. I think it's on a great track but can use a lot of improvements. I also want to add a
pelican on a bicycle hanging under the surfing board, making it look like it's powering the jet
engines with it's bicycling somehow. The most important part is that it should be smooth, no sudden
changes/flickering in the graphics. When I run it on firefox it looks horrible but on Chrome with
unsafe webgpu flag that can target nvidia card it looks great, but needs some more love!" And: "It
should also be possible to change the view direction by moving the mouse around instead of it
being locked while having control. Also remove the numbers from the screen apart from the scoring
one (number of things hit)."

Branch `feature/flyover-4` (`work/flyover4`, from `v0.1.6`). Brief:
`work/briefs-2026-11-15/flyover4.md`. Version 3 is `tasks/20261114-081432-flyover-striking`.

## State (2026-11-15, 05:30)

Done and committed on `feature/flyover-4`: the pelican on its bicycle, mouse look with a captured
pointer, the score alone on the screen, the smoothness work below, and the demos page's video,
poster and section. The game's test passes in Chrome 156 and Firefox 159 on the RTX 5070, and the
source suite passes. Nothing changed the seed, `host/gpu` or Godot's platform: `voxel-flyover` and
`godot-voxel-flyover` are the only images to rebuild (50 to 160 s).

The current take is `work/videos-2026-11-15/voxel-flyover-4/take3.mp4`; its README says how it
was made. The game drew 53.1 frames a second while recorded, at a machine load of 7.7 (two other
agents' Chrome renderers at 400% each); the 4.9 s after the click, in which Chrome's notice named
the page's local address, are out of the file. The demos page's video is its cut (2:19, 60 frames
a second, 24.4 MiB), and plays from the page in headless Chrome and Firefox.

Left:

- **What the owner sees in Firefox is not known.** See "Firefox" below: Godot's frames are the same
  in both browsers to the pixel and as evenly timed, and what Firefox does with them on a display
  the GPU drives could not be seen here. A screenshot or a few seconds of screen recording from
  the owner's Firefox would settle it.
- A take on a quiet machine: this one stutters where the machine did (53 frames a second shown
  at 60).
- The test failed twice in Firefox while an x264 encode of mine ran beside it (load 12): once
  the game did not reach its 120th frame in 180 s (not looked into; the wait is now 300 s), and
  once the view had turned 92 degrees and 9 up where 300 pixels make 60 (see "Mouse look").
- Not done: the trees' rings still cross-fade by a screen-door of pixels (grainy in the bands at
  64 to 80 and 200 to 232 units); the shadows' edges crawl as the sun moves 3 degrees a second;
  the fur's hair edges are not antialiased near the camera (alpha to coverage puts the shells in
  Godot's transparent pass: not tried further); the camera still flies through a beacon it
  lights in its view from ahead, which thins before it but fills the frame for a quarter second.

## How it is measured

All on this machine's RTX 5070 under `gpu@0`, Chrome 156 and the installed Firefox 159, on a
private Xvfb. The tools are `work/videos-2026-11-15/voxel-flyover-4/tools/` (not in git):
`dev.mjs` plays the working tree's project in the package's Godot without an image build (the
page composes `voxel-flyover` with `curl`, and fetches the project as a tar from the test server),
`probe.gd` is added to it as an autoload and saves frames and every frame's time, and
`analyze.mjs` computes the measures.

- **The fixed flight**: `--autopilot 60 --day 9`, a minute by itself from 09:00 of the game's day
  to 21:00, through all the camera's views, eight beacons, sunset and the first of the night.
- **Frame times**: the microseconds between `_process` calls over that flight, without its first
  two frames (Godot's start): median, 99th percentile, maximum, and the frames over twice the
  median. The game prints the same of its steady frames (`FLYOVER frame times`), and its test
  bounds the last.
- **Flicker**, on the luma of three consecutive frames a, b, c: a pixel reverses when it goes one
  way and comes back, by r = min(|b-a|, |c-b|). A moving edge passes a pixel once and does not
  reverse; a pixel that flickers, shimmers or pops for a frame does. *Shimmer* is the mean of r
  over all pixels (in 1/255 of full scale), *flick* the pixels with r over 12, per mille. Fine
  detail that moves fast reverses too, so the measure follows the movement on screen (about a
  fifth of the mean frame difference): it compares versions of one flight and is no absolute.
- **Bursts**: the flight at Godot's `--fixed-fps 60`, where the game's frames are the same
  whatever the machine's load or the browser, with three consecutive frames read back every two
  seconds (29 triples). **Slow bursts**: 40 s of it at `--fixed-fps 240`, a quarter of a frame's
  movement between frames, where what moves across the pixels hardly reverses and what flickers
  of itself still does (20 triples).
- **Jumps**: the flight at the fixed step with every frame read back and shrunk to 120 by 67, in
  tiles of 8 by 8 (128 pixels of the frame). A *spike* is a tile whose change in one frame is
  over 2.5 times that of the frames before and after and over 4/255: something there appeared,
  vanished or leapt. An *event* is a run of frames in which 8 tiles or more change over three
  times their median of the 30 frames around: a spike, or a movement that sets in. The frames
  around each spike were then read back whole and looked at; that is how the causes below were
  found.
- A capture of Chrome's screen at 60 frames a second repeats and drops frames when the machine is
  loaded (795 of 3,300 at a load of 5), so the measures above are taken on the game's own frames.

## What popped or flickered, and what was done

Each was seen on the frames named, in version 3 as shipped unless it says otherwise.

| What | Where it was seen | Cause | Fix |
| --- | --- | --- | --- |
| A band of light came or went on a hillside in one frame, at each step of the grids and when a beacon was lit; at night whole ranges were lit in broad bands that differed from grid to grid | spikes of 13 to 25 tiles at 6.8, 39.2, 54.8 and 57.2 s, of 2 to 7 at 36.0 and 36.9 s | In `pulse_light` a local named `reach` took the value of the ground's uniform `reach`, declared after it in another include: a ring stood at the grid's reach (180, 756 or 2,292 units) and was as wide, instead of running out at 75 units a second | Renamed. A ring also grows out of nothing in half a second, is gone before the next sets off, and fades with its beacon's distance (eight beacons, where the four nearest were shown and changed places at once); it leaves a glow behind its front |
| The fur of the corgi's legs flickered between long and short | spikes of 2 to 5 tiles a few frames apart, all flight | Godot hands a vertex stage the normal scaled as its part where the part's scale is even, of length one where it is not; a leg's scale changes as the corgi crouches and crossed from one to the other | `normalize(NORMAL)` in `fur.gdshader` |
| A bright dash between the jets every third frame, and the wakes' pattern slipping | spikes 3 frames apart, most at night | A place was added to the wakes at the board's own, so the first stretch had no length and no direction for a frame, and places were 1.2 to 1.7 units apart | Places exactly 1.2 apart; the first stretch takes its direction from the place after |
| The camera set off at once at each change of view | an event at every 10 s; in slow bursts the triple at 30.0 s had 5.15 of shimmer, the others 0.05 to 0.7 | One exponential approach: full speed in the first frame | The view follows a point that follows the next view |
| The camera rose and fell with the ground under it | events at 16.4 and 16.8 s | A hard floor 6 units over the ground at the camera's place | The highest ground under and up to 45 units ahead lifts it, by degrees |
| A turn of the view cut through the flyer (new with mouse look) | the look test's frames | The camera's place approached its goal along a straight line | It follows the flyer's place and heading a little late, and turns about it exactly |
| A beacon changed colour and brightness at once when lit | spikes at each lighting | The beacon was rebuilt | It takes its light over about a second |
| A beacon's chime was made as it was lit | by reading: 22,050 samples in a script's loop, in the frame | | The six notes are made before the flight |
| A beacon's shaft or crystal, or a tree, filled the screen for some frames as the camera flew through | events at 23 s (capture), 55.3 s | | They thin out before the camera |
| Far shafts and veins flickered as lines thinner than a pixel; the wakes seen on edge were bright lines | heat of the bursts | | A width of a pixel or a few, fainter in proportion; the wake fades as it turns its edge |
| The ground, sea, crowns and fur shimmered where their detail was finer than a pixel | slow bursts | Noise, flowers, ripples, clumps and hairs sampled once a pixel | Each fades to its mean by the size of the pixel on its surface |
| The clouds' shade leapt at dusk | by reading | The light's direction turns from the sun to the moon at once | The shade fades out before, with the light's height |
| The cape's and feathers' flutter raced when the speed changed | by reading | `TIME * speed` in the shader | The game counts the phase |
| A far mountain's shadow came at once | by reading (not seen on the flight) | Only the two finer grids cast shadows | All three do |
| A bicycle wheel's disc flashed white once a turn (new) | take 2's frames | A flat, smooth face turning through the sun's reflection | The discs are rough |
| The painted crowns past the last trees were squares | stills | A crown wider than its plot was cut off at the plot's edge | The nearest of nine plots' crowns |

Not a fault of the platform: a material's uniform set every frame reaches the screen every frame
(a patch whose brightness a uniform stepped, read back for 220 frames).

## Measurements

Version 3 is `v0.1.6`'s game, each measure on its own flight and camera; "now" is `dcd36b2db`.
Chrome and Firefox draw the same frames at a fixed step (mean difference of 87 frames 0.016/255,
and the same spikes and events to the tile), so one row serves both unless it says so.

| Measure | Version 3 | Now |
| --- | --- | --- |
| Spikes over the flight (tiles, frames with one) | 350 in 117 | 78 in 76, two of them of two tiles, none of more |
| Events of 8 tiles or more | 16 | 9: the changes of view at 30, 40 and 50 s (4), two turns toward a beacon, one at 52.6 s where a ring sets off close to the camera, and the flight through a beacon at 55 s (2) |
| Tile jumps | 5,902 in 722 frames | 3,022 in 686 |
| Slow bursts: shimmer of 20 triples, the worst triple, flick | 0.431, 2.91, 6.5 per mille | 0.208, 0.50, 2.5 per mille |
| Bursts: shimmer of 29 triples, flick | 1.273, 23.3 per mille (movement 5.43) | 1.129, 20.9 per mille (movement 5.07) |
| Bursts on one flight and camera (this version's), with version 3's shaders and the new | 1.317, 24.5 per mille | 1.161, 21.9 per mille (before the last fixes) |
| GPU time a frame, Godot's measure | 5.2 to 5.5 ms | 5.1 to 5.5 ms |
| Frame times over the flight, Chrome | load 1.5: median 16.5 ms, p99 20.0, max 38.6, 2 of 3,598 over twice the median | load 7, while its screen was captured: 18.9, 36.5, 59.7, 18 of 3,126 |
| Frame times over the flight, Firefox | load 1.2: 17.0, 19.9, 37.6, 4 of 3,541 | load 7: 17.0, 24.5, 47.9, 11 of 3,470 |
| The test's flight (30 s), Chrome | 60.0 frames a second (version 3's task) | load 1.5 (`dc773fcfe`): 59.9, median 16.7 ms, p99 20.9, max 31.1, no hitch; load 11: 52.8 to 54.6 |
| The test's flight, Firefox | 59.0 | load 1.5 (`dc773fcfe`): 59.0, 17.0, 20.9, 46.2, 4 hitches; load 11: 52.7 to 53.6 |

The GPU's time a frame is unchanged with the pelican (some 40 more draws), the third grid's
shadows and the nine-plot crowns. From 03:00 the machine's load was 7 to 14 (two other agents'
Chrome renderers at 400% each), so this version's frame times on a quiet machine are those of
its first commit alone; the rate follows the load, as version 3's did (its task: 25.9 frames a
second at a load of 8). The shimmer of the plain bursts follows the movement on screen and says
little; the slow bursts and the spikes are the measures of what was fixed.

## Firefox

What was found, in the order it was looked for:

- **Godot draws the same picture.** At a fixed step the frames the game reads back from its own
  render target are the same in Chrome and Firefox: mean difference 0.000 to 0.021 of 255 over
  the triples, 0.34 per mille of pixels over 12 at most. No effect the game uses is missing in
  Firefox (it uses SSAO, glow, volumetric fog and shadows, none of which needs the texture format
  tiers).
- **As evenly timed.** Frame times over the fixed flight: Chrome median 16.5 ms, p99 20.0, max
  38.6; Firefox 17.0, 19.9, 37.6. Same adapter (the NVIDIA card through Vulkan in both).
- **So what differs is how Firefox shows the frames, and that could not be seen here.** On Xvfb
  Firefox composites in software and shows no WebGPU canvas at all (docs/gpu.md). Forced to
  composite with OpenGL (`gfx.webrender.all`, `gfx.webrender.software=false`; Mesa's llvmpipe on
  Xvfb) it shows the canvas, and then:
  - the game's picture had red and blue exchanged (a blue corgi under an orange sky), in the
    window and in Playwright's screenshot alike;
  - in a page of bare canvases cleared to red and blue, an `rgba8unorm` canvas showed right, a
    `bgra8unorm` one (Firefox's preferred format, which `host/gpu` configures) showed nothing at
    200 by 100 and showed exchanged or right at 1920 by 1080 from one run to the next; with
    Firefox's own defaults an `rgba8unorm` canvas crashed the browser;
  - the window showed 109 different frames in 20 s while the game drew 52 a second.
  None of this is the owner's configuration (a GNOME X11 session whose Firefox composites on the
  NVIDIA card), so it says where to look and not what the owner sees. A private display the GPU
  drives was tried with a headless gnome-shell and its Xwayland and given up: it started the
  desktop's services and watched the owner's login session, and its Xwayland never answered.
- Not looked into: how Firefox hands a WebGPU canvas's frames to its compositor on Linux. If it
  reads each frame back and uploads it again, its screen would show fewer and less even frames
  than the game draws, whatever the game does.

Nothing was changed in `host/gpu` for it: a choice of canvas format made by what was seen on
llvmpipe would be a guess about the owner's screen. The game's own share is done for both
browsers alike: less of what flickers when frames are shown unevenly.

## Mouse look and the screen

The game asks for the pointer from its start; the page gives it at a person's click (a trusted
event), which also takes the board, and takes it back at Escape, which also lets go of the board
(the page keeps that key while it holds the pointer). Enter still takes the board without the
pointer, and a click then gives it. The mouse turns the view around the flyer (0.0035 rad a
pixel, any way round, 0.5 rad up and 1.0 down), eased over a few frames; let go, the view comes
back the short way round. No Control takes the motion: the HUD's are Labels, whose mouse filter is
ignore, and the game reads the motion in `_input`. The test clicks, waits for
`document.pointerLockElement`, moves the mouse 300 pixels and reads the view the game prints at Q:
60 degrees in Chrome, 58 in Firefox. Once, in Firefox on a loaded machine, it read 92 degrees
and 9 up: more motion than the mouse made. The game now leaves the motion of the first quarter
second after a capture, and lets no one motion turn the view more than 150 pixels' worth, so a
pointer's way to where it was captured cannot throw the view. That was not the cause: with it,
and a second between the capture and the moves, Firefox read 83 degrees in one run of two at a
load of 13 and 59 in the other, Chrome 60 in both. So on a loaded machine Firefox reports more
relative motion than Playwright's moves make; whether a person's mouse does the same there is not
known, and the test accepts 30 to 150 degrees. The screen keeps the title, the keys' hint (for 12 s after the
board changes hands) and one number, the beacons lit, beside a beacon's crystal.

## The pelican

`pelican.gd`, of Godot's primitive meshes like the corgi: a white bird in a cyclist's red cap with
a long bill and its pouch, on a yellow bicycle with disc wheels that hangs from the board by its
head tube and rear axle. A chain runs from the chainring to a sprocket on a shaft between the two
engines, and a fan turns in each intake; chain, shaft, fans and wheels turn by the cranks' one
angle. The cranks turn 1.05 times a second at cruise and faster with the speed; the flames
lengthen and the nozzles brighten with each stroke, a ring of brighter gas runs down each flame
and a pulse down each wake. Its legs are laid from hip to knee to pedal each frame; its feathers
are the fur's shells, and its flight feathers, tail and crest are strips of the cape's cloth.
The camera's third view, of five, is the pelican's.
