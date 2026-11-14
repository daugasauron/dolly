# Godot

Godot 4.7 from upstream's release, built inside Dolly by SCons with Dolly's
`cc`, as the `godot` package, with one patch
([`godot-dolly.patch`](godot-dolly.patch)): it names Dolly's WebGPU driver to
Godot, Forward+ starts SDFGI only where the device has image atomics,
which WebGPU does not (SDFGI also needs more storage textures than WebGPU
gives a shader stage), and the Project Manager draws on `gpu@0` as the editor
does, where upstream starts it on the Compatibility renderer, which here is a
software rasterizer: a hover took 0.6 s to show on it, 9 to 33 ms on `gpu@0`;
the editor's debugger listens on a local socket, as Dolly has no network ones, and its
Debug Adapter server, which listens on TCP for other editors, is left out. In Firefox, which has
neither of WebGPU's texture format tiers, SSIL, the depth-of-field blur, VoxelGI and 2D SDFs do
not draw: the first dispatch of each says so.
`amy install godot`, then
`godot --path DIRECTORY` runs a project on the page, drawn by Godot's
Mobile and Forward+ renderers through a RenderingDevice driver on `gpu@0`
where the browser grants WebGPU, and by its Compatibility renderer on Mesa's
OpenGL otherwise, and `godot --headless` runs one without drawing; `--script FILE` runs a script in the project of the
current directory. Its sound plays through `audio@0`. `godot-editor` is
Godot's editor: it imports a project's assets and exports its pack inside
Dolly, as it exported Dodge the Creeps for `amy install dodge-the-creeps`
([task](../../tasks/20261107-131836-godot/TASK.md)).

## Images

- `godot`: Godot 4.7's engine with GDScript, 2D and 3D with Godot's own physics, the fallback text server, its renderers on `gpu@0` and the Compatibility renderer on Mesa, and sound, which runs a project or the pack the editor exported.
- `godot-editor`: Godot 4.7's editor, which imports a project's assets and exports its pack inside Dolly, and draws its own window on the page, or on the X server DISPLAY names.
- `spirv-wgsl`: A build stage: Tint, from Dawn, and SPIRV-Tools under Dolly's passes, which translate the SPIR-V Godot compiles its shaders to into WGSL for `gpu@0`.
- `dodge-the-creeps`: Dodge the Creeps, the game of Godot's first 2D tutorial, which Godot's editor imported and exported here; `dodge-the-creeps` plays it.
- `truck-town`: Truck Town, the demo projects' vehicle physics demo: a minivan, a semi-truck and a tow truck in a town at four times of day, drawn by Godot's Forward+ renderer on `gpu@0`; `truck-town` plays it.
- `lantern-drift`: Lantern Drift, Dolly's showcase game for Godot: a paper lantern glides through rings of light over a sky archipelago from sunset into night, drawn by Forward+ on `gpu@0`; `lantern-drift` plays it.
- `godot-lantern-drift`: Lantern Drift on the page at once; Q leaves a shell where `godot-editor -e --path ~/lantern-drift` opens a copy of its project in Godot's editor, the islands in its 3D view. The eye beside HUD in the Scene dock hides the game's display, F5 plays the game so, and Ctrl+S saves the scene.
- `airtime-godot`: Airtime: Foundry in Godot, the strafe trials of bhop on Airtime's own movement and course, drawn by Forward+ on `gpu@0` as a foundry at night over molten metal; `airtime-godot` plays it.
- `godot-airtime`: Airtime in Godot on the page, which starts at once; Q leaves a shell where `godot-editor -e --path ~/airtime` opens a copy of its project in Godot's editor, the course in its 3D view. The eye beside Hud in the Scene dock hides the game's display, F5 plays the game so, and Ctrl+S saves the scene.
- `voxel-flyover`: Voxel Flyover, a corgi's flight on a jet surfboard over an endless world of mountains, forests and sea through a day and a night, which the GPU builds in its shaders, drawn by Forward+ on `gpu@0`; `voxel-flyover` plays it.
- `godot-voxel-flyover`: Voxel Flyover on the page at once: the corgi flies itself until Enter takes the board, and Q leaves a shell.

## Lantern Drift

[`lantern-drift/`](lantern-drift) is a Godot project made for Dolly: scenes, scripts and
shaders, no art or sound files. Islands, pines, crystals, rings and sky lanterns are Godot's
primitive meshes under its materials and shaders; the sky, the cloud sea and the islands' rock
and grass are shaders; the bells, the crash and the wind are synthesised at start. It uses
Forward+'s volumetric fog (the sun's shafts between the islands, the lantern's and the rings'
glow in the haze), glow, SSAO, GPU particles, clustered lights and directional shadows, and the
sky darkens from sunset into night as the run goes on. Godot's editor imports and exports it
while the package builds. It drew 59 frames a second at 1600 by 900 in Chrome (NVIDIA RTX
5070, 2026-11-10). `-- --autopilot SECONDS` flies a run by itself, as the title screen does, and
prints its frame rate, rings and score.

## Voxel Flyover

[`voxel-flyover/`](voxel-flyover) is a Godot project made for Dolly, of scripts and shaders alone.
Its world is a function of the place ([`terrain.gdshaderinc`](voxel-flyover/terrain.gdshaderinc)):
seas and continents, hills, a climate, and ranges of mountains whose spurs stand on their crests
and whose gullies on their spurs, from an integer hash. Nothing of the world is stored or built on
the CPU. Three grids of land follow the flight, of 257 by 257 points 1.5 units apart, as many 6
apart around them and 193 by 193 24 apart to the horizon, 2.3 km off. When the grids step after
the flight, one pass draws each grid's ground into a texture of a texel a point: the height and
the climate ([`ground.gdshader`](voxel-flyover/ground.gdshader)). The land's vertex stage raises
its points to it, blending into the coarser grid's toward its edge, and its fragment stage takes
the slope from the same texture and dresses the ground by it
([`land.gdshader`](voxel-flyover/land.gdshader),
[`ground.gdshaderinc`](voxel-flyover/ground.gdshaderinc)): meadow, heath or desert by the climate,
mottled and dotted with flowers, bare rock in strata where it is steep, snow where it is high and
lies, sand by the sea, veins of crystal that glow at night with a light that runs along them, and
the rings that run out over land and sea from each beacon the flyer has lit. A tree stands in
a plot of 4 units where the climate has one and the ground is not steep
([`flora.gdshaderinc`](voxel-flyover/flora.gdshaderinc),
[`trees.gdshader`](voxel-flyover/trees.gdshader)): a trunk and a ball, which the vertex stage
shapes into firs with tiers of boughs in the cold, broad lumpy crowns in the wet, in places in
blossom or autumn colours, slender spires in the desert, and groves that glow at night; the
fragment stage roughens a crown's light as leaves do. The sea mirrors the sky, with the sun's
glitter on its ripples and foam that glows at night along the shore
([`water.gdshader`](voxel-flyover/water.gdshader)). The sky follows the hour, with stars, the
moon and an aurora, and carries a layer of cloud lit from the sun's side, whose shade falls on the
ground ([`sky.gdshader`](voxel-flyover/sky.gdshader)). A day lasts two minutes: one light is the
sun and then the moon, with four shadow cascades over 420 units, 4x MSAA, SSAO, glow, haze that
thickens toward the sea, and volumetric fog, in which the low sun draws shafts and the board's
searchlight shows at night.

Nothing appears or goes at once. The same trees are drawn by four grids, each a ring further from
the flyer with a simpler mesh: a crown of 12 rings to 80 units, of 5 to 232, of 3 without a trunk
to 420, and eight triangles to 690. Where two rings overlap, one's trees thin out pixel by pixel as
the other's fill in, both asking the same number of the pixel, and past the last ring the land's
shader paints the same crowns on the ground they stand on, and further still the colour of the
climate's share of them. The land's grids blend their heights by the distance from the flyer,
which moves smoothly while the grids step, and the beacons brighten from 340 units to 230.

The flyer is a character of our own, drawn for this game from Godot's primitive meshes: a corgi in
mirrored sunglasses and a red cape, crouched on a teal surfboard that two small jets carry. Its
coat is fur in 18 shells ([`fur.gdshader`](voxel-flyover/fur.gdshader)): each furred part is drawn
again and again a little further out along its normals, keeping the pixels where a hair is that
long, and the hairs lean and shiver in the air the flight drives past. It crouches lower the
faster it goes and the harder it turns, leans and looks into its turns, its ears lie back and
its tongue flaps; the cape is a cloth its vertex stage flutters and swings out of a turn
([`cape.gdshader`](voxel-flyover/cape.gdshader)), and each jet leaves a wake, a ribbon the vertex
stage lays along the places the board has been ([`wake.gdshader`](voxel-flyover/wake.gdshader)).
The board banks into its turns.
[`terrain.gd`](voxel-flyover/terrain.gd) computes the world's function for the flight, with the
same integer hash, so the board clears the ground the GPU draws and finds the beacons that float
over it. The corgi flies itself until Enter takes the board, and until then the camera glides
between four views of it. `-- --autopilot SECONDS` prints its frame rate, the time a frame took,
the beacons it lit and what its frame shows.

The world was blocks, then hexagonal columns, and is now smooth land. Its 1920 by 1080 frames take
the GPU 5.2 to 5.5 ms by Godot's own measure and its renderer's thread 0.6 to 0.8 ms, and it draws
60.0 frames a second in Chrome 156 and 59.0 in Firefox, the display's rate (the test, NVIDIA RTX
5070, 2026-11-14), and 60.0 in Chrome while its screen was recorded. Those are a quiet machine's:
beside other work the same test gave 59.2 and 57.7 at a load of 2.7, and 25.9 in Chrome at a load
of 8, where the renderer's thread took 2.8 ms a frame. What was measured on the way, in Chrome:

- Hexagonal columns whose vertex stage computed the terrain's function took 15.6 ms a frame: every
  vertex of every column ran it again in the depth pass, the colour pass and each shadow cascade.
  Reading it from a texture drawn once a step: 9.1 ms; with shorter column sides and two shadow
  cascades, 6.6. In a V8 sampling trace of that flight the game's thread waited in nine samples of
  ten, for the page's next frame or a lock, so the processor does not set the rate.
- The smooth land has 0.3 million triangles where the columns had 3.4: 3.2 ms a frame with two
  cascades over 170 units, 4.3 with four over 420, and 4.6 with 4x MSAA in place of FXAA.
- Trees to 690 units in four rings of detail, where two grids drew them to 256, and the corgi's
  fur: 6.1 ms. One grid of plain crowns for the shadows of all of them, and a slope read from two
  heights more where it was four: 5.4.
- On an Xvfb display Chrome's Vulkan swapchain showed a full-screen page at 27 to 35 frames a
  second whatever it drew, an empty WebGPU canvas too, and 60 at 1280 by 720. With
  `--disable-vulkan-surface` Chrome copies each frame to the X server itself: 60 frames a second
  at 1920 by 1080, of which a capture of the screen at 60 saw 237 in 240. The test and the
  recording run so. The first version of the game drew 42 and 34 frames a second on the swapchain,
  and 60 with the flag. A display the GPU drives was not measured.

Both games build their worlds in scripts as they start. The builders ([`world.gd`](lantern-drift/world.gd)
with its islands and rings, Airtime's [`foundry.gd`](airtime/foundry.gd) and [`pads.gd`](airtime/pads.gd))
are tool scripts, so Godot's editor runs them too and its 3D view shows what the game starts in;
what they build there is not the scene's and is not saved with it.

## Building

Godot's build is SCons over its own platforms, each a directory of
`platform/`. Dolly's is [`platform/`](platform), placed as `platform/dolly`
([`prepare-sources.sh`](prepare-sources.sh)):

- [`detect.py`](platform/detect.py) names Dolly's `cc`, `c++` and `ar`
  (LLVM's, which writes its own index, so no ranlib), the `wasm64`
  architecture, an export template's build (`template_release`) and the
  Compatibility renderer, with Mesa's EGL and its softpipe driver linked in,
  beside the RenderingDevice driver on `gpu@0`
  ([`rendering_device_driver_webgpu.cpp`](platform/rendering_device_driver_webgpu.cpp),
  [task](../../tasks/20261108-040718-godot-gpu/TASK.md)) and the translator of
  Godot's SPIR-V into WGSL ([`spirv-wgsl`](spirv-wgsl)).
- [`os_dolly.cpp`](platform/os_dolly.cpp) is the operating system as Godot
  sees it: Godot's Unix driver for files, clocks and processes, Dolly's name
  and feature (`OS.has_feature("dolly")`), the program's path from
  `/proc/self/exe`, the XDG directories as on Linux, and the main loop, which
  runs until the project quits. [`godot_dolly.cpp`](platform/godot_dolly.cpp)
  is `main`.
- [`display_server_dolly.cpp`](platform/display_server_dolly.cpp) is the
  window: the page's canvas through `display@0`, keys, text, the pointer and
  the wheel of `input@0` (keys mapped by Godot's web platform's table), and an
  OpenGL 3.3 core context on Mesa's surfaceless EGL platform. Godot draws into
  a pbuffer of the window's size; each frame is read back, turned upright and
  presented, and with vsync Godot then waits for the page's next animation
  frame. Where `DISPLAY` names an X server (`x11-desktop`), the window is one of
  its windows instead, through [`x11-window`](../x11/README.md), whose records are
  `input@0`'s: the window manager moves, resizes and closes it, and frames
  RenderingDevice draws into a texture are read back and put in it. Its clipboard
  is `clipboard@0`'s ([input](../../docs/input.md#clipboard)), and the program's
  own beside a program that holds that; the screen is never kept on, as on
  Godot's web platform.
- [`audio_driver_dolly.cpp`](platform/audio_driver_dolly.cpp) plays Godot's
  mix as `audio@0`'s stereo float PCM at 48 kHz: a thread of its own keeps
  100 ms queued ahead of the page, as the SDL port does.
- [`SCsub`](platform/SCsub) links the program, with Godot's GLAD loader,
  which takes OpenGL's functions from `eglGetProcAddress`.

The recipe builds on `mesa-build` ([Ghostty's GTK demo](../ghostty-gtk/README.md))
and leaves out the modules a 2D project does not need
(`modules_enabled_by_default=no`): GDScript, 2D physics and the fallback
text server with FreeType, and no 3D, 761 units in place of Godot's 2,097.
In a session in Chrome they compiled in 5 min 43 s at four jobs. A GDScript
loop of primes and dictionary updates took 1.19 s in Chrome and 0.32 s in
Godot's own Linux build (2026-11-07).

Softpipe runs every shader in its interpreter on the CPU: a scene of a
background, a textured sprite and a label draws at 11.7 frames a second at
640 by 360 and 42.2 at 320 by 180, with or without vsync (Chrome, 2026-11-08);
in the test, 12.0 in Chromium and 12.8 in Firefox.
Its frame matches the one Godot's Linux build draws on llvmpipe except for
rounding: 5,366 of 230,400 pixels differ, 111 by more than 32 levels, all in
the label's last two words.

The editor ([`Dollyfile-godot-editor`](Dollyfile-godot-editor)) is the same
release on the same platform with Godot's default modules, 2,561 units,
less two: Basis Universal, whose encoder names a header of Linux's that
Emscripten's libc and Dolly's leave out (`sys/timex.h`), and Jolt Physics,
which knows WebAssembly only as Emscripten (3D physics is Godot's own). It
compiled in 26 minutes in the image build, a 182 MB program. Its debugger listens on a local
socket (below). The GDScript language server and the Debug Adapter server serve other editors
over TCP, which Dolly does not have: the language server's one module of its own, JSON-RPC, is
not built (upstream's switch), and the patch leaves the adapter out. The template packages the
modules an exported 2D game loads beside the engine's: Ogg Vorbis, MP3, WebP
and regular expressions.

[`Dollyfile-dodge-the-creeps`](Dollyfile-dodge-the-creeps) takes the game
from the demo projects' release as published, gives it an export preset,
which the release does not carry, and has the editor import its assets and
export its pack while the package builds.

What the platform decides ([process model](../../docs/process-model.md)):

- Threads: Mesa is built with `-pthread`, so Godot is too (`threads@0`).
- One window, the page's canvas, which scales the frame; Godot's window
  size is the project's. On an X server, one window there.
- Keys: the editor's and the Project Manager's Ctrl+C is Copy, as in a window on
  a desktop: while it has the page they clear `ISIG` on their terminal, so the
  interrupt key is theirs ([process model](../../docs/process-model.md)), and
  their Quit ends them. A game keeps Ctrl+C as the terminal's interrupt.
- Sockets: Godot links Dolly's local stream sockets (`sockets@0`). The editor's
  debugger listens at `/tmp/godot-debugger-PID.sock` (the patch: upstream's default
  is TCP, which has no network here), and a game the editor runs connects there:
  its output, errors and breakpoints reach the editor.
- Processes start with `posix_spawn`, as Dolly has no `fork`. An instance of
  Godot asked for without its PID (the Project Manager opening a project,
  the editor's restart or its return to the project list) takes the
  program's place by `execv` when the program ends that frame, as Godot's
  web editor runs a new editor in its canvas once the old one exits: one
  surface and one foreground. If the program goes on, it is a child.
- An export template runs only the pack beside it unless it is built with
  `disable_path_overrides=no`, which lets `--path` and `--script` name a
  project. A project the editor has not imported has no
  `.godot/global_script_class_cache.cfg`; the template says so ("Could not
  load global script cache") and runs it.
- Godot reads `CLOCK_MONOTONIC_RAW` where the headers define it, and its
  Unix file access links the extended-attribute calls: Dolly's libc reads
  that clock from the monotonic one and fails the calls with `ENOTSUP`.
- SCons takes a compiler on `PATH` only by its execute bit, which Dolly does
  not keep; the platform names the compiler.

Test: [`test/godot-browser.mjs`](test/godot-browser.mjs) installs the
package into `default`, runs a project headless whose script computes,
emits a signal, adds a node, sleeps, waits on a timer, writes and reads JSON
under `user://` and quits with a status of its choosing. Then a 2D scene
draws on the page: the test waits for it on the canvas, hears its tone on the
right channel only, sends a key and a click that its script reports, and the
script checks pixels of its frame, in Chromium and Firefox.

[`test/godot-editor-browser.mjs`](test/godot-editor-browser.mjs) installs the
editor and the game: the editor imports an SVG into a project and exports
its pack, which `godot` runs; the game shows its title on the page and
starts on Enter, its score counting; and the editor opens its own window on
the page and shows its 2D view at a click on the tab, in Chromium (46.3 s)
and Firefox (50.4 s).

[`test/godot-gpu-browser.mjs`](test/godot-gpu-browser.mjs) runs Godot's
RenderingDevice on `gpu@0` (`platform/rendering_device_driver_webgpu.cpp`) on
a hardware adapter, in Chrome and the installed Firefox on a display: a 2D
scene on the Mobile renderer, a 3D scene with a sky, light and shadow, and
the editor, each reading its own frame back.

[`test/godot-projects-browser.mjs`](test/godot-projects-browser.mjs) opens each game's project
in the editor as a newcomer does, on a hardware adapter, in Chrome and Firefox: a probe plugin
counts the meshes the scene shows and the colours of the 3D view; the HUD is hidden with its eye,
the game runs with F5 and the scene is saved; a node's name copied in its rename field is the
browser's clipboard's and pastes into another's, and the browser's text pastes as a third's.
Both games passed in both browsers on 2026-11-13, the editor's log without an error.

[`test/godot-flyover-browser.mjs`](test/godot-flyover-browser.mjs) opens `godot-voxel-flyover` from
the front page's list of applications, on a hardware adapter, in Chrome and Firefox: the game
draws on `gpu@0`, Q leaves the shell, and a flight by itself through a morning reaches a beacon
and reports a frame with the sky along its top.

[`test/godot-x11-browser.mjs`](test/godot-x11-browser.mjs) installs the editor and Lantern Drift
with amy in `x11-desktop`'s xterm: the game and then the editor open windows of their own on the
X server, take keys and the pointer, and close at twm's Delete. On 2026-11-13 (NVIDIA RTX 5070)
the game's window drew 12 to 14 s after its command and the X server showed 28.2 frames a second
of it in Chrome and 49.0 in Firefox; the editor's window drew 53 s after its command.
