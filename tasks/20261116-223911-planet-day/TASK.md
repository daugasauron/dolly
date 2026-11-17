# Voxel Flyover is the planet, with mobile controls (2026-11-17)

- STATUS: OPEN
- PRIORITY: 300
- TAGS: godot,demo,planet,0.1.8

Owner (2026-11-17 07:30): "The Planet stuff is completely awesome. Replace the current game with
this, I also want to keep improving it. One major thing is I want it to support mobile controls.
Keep using Fable5.2 to work on the game today until 6pm, if you run out of work see my previous
comments about it." Brief: `work/briefs-2026-11-17/planet-day.md`. The planet's own record is
`tasks/20261116-133746-planet`; its stages are `tatr ls :planet`.

## State (2026-11-17, afternoon)

Done: the replacement, the touch controls with Godot's platform reading `touch@0`, their test,
and the three research tasks the planet took over. Served on
`http://127.0.0.1:9049/godot-voxel-flyover/` (`dolly-serve-planet`).

Left:

- **A phone held upright in Firefox, and a phone-sized touch screen in Firefox at all** (below).
- **The owner's own phone**: nothing here is a real touchscreen or a phone's GPU. The controls
  were driven by Chrome's touch events and Firefox's touch PointerEvents on this machine's two
  GPUs; a session on the owner's phone would say whether the thumb's stick sits right, whether
  the page's own bar is in the way, and what a phone's GPU makes of the game.
- **The other Godot images are not built on the new Godot**: `airtime-godot`, `lantern-drift`,
  `dodge-the-creeps`, `truck-town` and their applications have `touch@0` in their recipes and are
  for the integrator's round (Godot 46 minutes, its editor 98 under this day's load, with
  `bigbuild`: the editor's build at the 6 GB cap crashed its tab).
- An even 30 a second on the AMD GPU (the numbers below), and rates on a quiet machine.
- The planet's stages 3 to 8.

## What replaced what

One game under Voxel Flyover's names (`01d5efeed`): the planet's project is
`demos/godot/voxel-flyover`, its recipes `Dollyfile-voxel-flyover` and
`Dollyfile-godot-voxel-flyover`, its test `test/godot-flyover-browser.mjs`. Gone: the flat
flyover's project, the planet's own recipes (`Dollyfile-voxel-planet`,
`Dollyfile-godot-voxel-planet`), its test (`godot-planet-browser.mjs`), and its rows in
`config/upstreams.json`, `test/amy-browser.mjs`, `prepare-sources.sh` and the README's list of
images. The image names did not change, so the front page, the menu,
`config/domain-pages-images.txt` and the demos page point at the planet as they stand. The game
is named Voxel Flyover and prints `FLYOVER` lines. The README's section is the flyover's with
the planet's as its subsection "The planet".

## Mobile controls

- **Godot's platform** (`demos/godot/platform/display_server_dolly.cpp`): it takes `touch@0`'s
  lease beside `input@0`'s and turns each frame's finger records into Godot's
  `InputEventScreenTouch` and `InputEventScreenDrag`, a finger keeping the lowest free index from
  its down to its up. No new browser authority: `touch@0` is the module SDL2 programs already
  use. Every recipe that runs Godot declares `touch@0` (the lint asks it). A project that leaves
  Godot's `emulate_mouse_from_touch` on gets the mouse from the first finger, so the editor and
  the other games are usable by touch too (not tried).
- **The game** (`touch.gd`): the first touch takes the board and the controls show from then
  on. A stick stands where the left thumb comes down on the lower left: sideways steers, up
  climbs (held, out of the air and on to orbit), down dives. A finger anywhere else turns the
  view, two fingers moving apart or together zoom, and a ring with a cross at the top right
  gives the board back. Thin pale rings and a knob, sizes by the screen's shorter side; the
  keys' words are replaced by three short lines in larger letters.
- **A screen held upright**: the game sizes its window to the screen, in its shape, with no more
  pixels than 1080 by 1920 and no taller than `gpu@0`'s 2,304; the camera takes its angle of
  view across. A screen on its side keeps the game's 1920 by 1080, which the page fits into it.

### How it was tested

`demos/godot/test/godot-flyover-touch-browser.mjs`, fingers alone (Chrome's touch events through
CDP; in Firefox the touch PointerEvents its touchscreen sends a page), on the NVIDIA card in both
browsers and on the AMD GPU in Firefox:

- Sideways (844 by 390 in Chrome, 1180 by 820 in Firefox): a tap takes the board; the thumb's
  stick is held up and to the right for ten seconds while a second finger drags the view, so two
  fingers are down at once; two fingers apart zoom. The game's report: the board climbed from 67
  to 162 to 181 units, turned from 90 to 222 to 271 degrees, the view turned 86 degrees, the zoom
  went from 1 to 0.45, five touches.
- Upright (390 by 844, Chrome): a tap takes the board and a tap on the ring gives it back.
- Looked at: the page's screenshots of both (`build/planet/out/touchshots/`), and the controls
  on a desk's screen with the mouse as one finger (the game's `--touch 1`).

### Found on the way

- The controls' Control had an empty rect (`set_anchors_preset` in `_ready` keeps the rect it
  has): the stick's reach was nothing and a drag turned the view by infinity. It showed as
  Godot's errors about the camera's frustum, not as a failure of the first test's asserts.
- **Firefox draws no frame once a surface of `gpu@0` is sized again**: with the game sizing its
  window to the page, `__dolly.gpu` reported the new size and its frame count stayed at 2.
  Chrome draws on. So the game sizes its window only on a screen held upright, and the test's
  upright part runs in Chrome. Not looked into (`host/gpu/worker.mjs` sets the canvas's size
  and takes its current texture; Firefox may want the context configured again).
- **Firefox at 844 by 390 with a touchscreen presents one frame and no more**, with the game's
  window left at 1920 by 1080; without a touchscreen at that size it draws, and with one at 1600
  by 900 and 1180 by 820 too (`build/planet/ffprobe.mjs`). Not looked into: Playwright's
  Firefox with `hasTouch`, not a phone.
- A surface of `gpu@0` may be 4,096 wide and 2,304 high: a phone's screen held upright at its
  own pixels (1170 by 2532) is taller.

## Numbers

The game's test on the new Godot (the image of `14:29`, load 10, other agents' browsers on the
NVIDIA card): 30 s on the ground, then 100 s that leave the planet.

| | Ground: rate, GPU ms, median, p99, longest, hitches | Leaving: rate, GPU ms, median, p99, longest, hitches |
| --- | --- | --- |
| NVIDIA, Chrome | 31.0, 8.5, 32.3, 40.4, 73.0, 2 | 35.5, 6.6, 29.8, 42.0, 165.1, 4 |
| NVIDIA, Firefox | 32.4, 9.7, 30.2, 50.2, 78.0, 4 | 44.5, 6.9, 20.6, 37.5, 86.7, 33 |
| AMD, Firefox | 23.5, 21.0, 40.7, 61.5, 70.0, 0 | 27.3, 16.7, 35.0, 53.8, 73.5, 2 |
| AMD, Chrome | 23.3, 20.3, 41.8, 54.0, 62.4, 0 | 27.0, 16.1, 35.7, 51.4, 63.0, 0 |

On the AMD GPU the game went between 30 and 20 a second with its GPU at 21 ms a frame: its
pacing took 30 only under 22 ms. It takes it under 24 now (and keeps it under 27, as before).

## The research tasks

`tasks/20261115-121944-research-02` (erosion-like heights): closed, not to be done, with the
planet's make-up measured against the owner's word on flat land and rare peaks.
`research-05` (rivers and lakes): its State is the planet's; open for what it lists.
`research-15` (the weak adapter): its State is the planet's; FSR 1 measured and not kept.
