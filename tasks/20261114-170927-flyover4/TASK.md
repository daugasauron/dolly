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

## State (2026-11-15)

See the sections below; this one is rewritten as the work goes.

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
  seconds (29 triples). This is the measure for before and after, and the only one for Firefox,
  whose canvas an Xvfb display does not show.
- **Jumps**, on a lossless 60 fps capture of Chrome's screen, over 16 by 9 tiles: a tile jumps
  when its mean frame difference is over three times the median of its 30 frames around and over
  4/255. The capture repeats frames when the machine is loaded, so it is taken at a load under 2.
