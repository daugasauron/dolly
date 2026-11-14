# Videos that show what Dolly can do: a Godot voxel flyover and three more

- STATUS: OPEN
- PRIORITY: 300
- TAGS: 0.1.6,demo,recording,godot

Owner (2026-11-14): "I want you to use fable5.2 to create more videos. I think this environment is
incredibly powerful and quite cool, I want you to demonstrate the power of it. I want one video
where godot is used to create a REALLY COOL visually striking 3d game with shaders/gpu etc. I like
the "Voxel flyover" idea. For other videos, be creative."

Branch `feature/videos-0.1.6` (`work/vids`), from main `ee42c5982`. Brief:
`work/briefs-2026-11-14/videos.md`.

## State (2026-11-14)

Done: the game. `demos/godot/voxel-flyover` is a Godot project of scripts and shaders; the package
`voxel-flyover` and the application `godot-voxel-flyover` build (43 s on the release candidate's
images; the editor imports and exports the pack), and `demos/godot/test/godot-flyover-browser.mjs`
passes on the RTX 5070 in Chrome 156 (42.5 frames a second in a 1600 by 900 page on Xvfb) and the
installed Firefox (59.0). `godot-voxel-flyover` is in `config/domain-pages-images.txt`.

Left: the game's video, the other videos, their sections on the demos page, `plays.mjs`.

## The game

How it works is in `demos/godot/README.md` ("Voxel Flyover"). Decisions:

- The world is a function in the shaders, not meshes built in GDScript: GDScript in Wasm is
  about four times slower than native, and a grid of instanced boxes raised by the vertex stage
  costs the CPU nothing a frame. `terrain.gd` repeats the function for the flight; the hash is
  integer arithmetic so both agree.
- Measured (Chrome 156, 1920 by 1080 frames): 4.9 ms of GPU and 0.5 ms of render CPU a frame by
  Godot's own measure. The frame rate on Xvfb follows the page's size and not the scene: 35 in a
  1920 by 1000 page, 36 at 1600 by 900, 49 at 1280 by 720, 60 at 960 by 540, and the same 33 to 38
  with grids a sixteenth the size, without SSAO and volumetric fog, or with two shadow cascades.
  Headless Chrome has no adapter here, so a recording is of the Xvfb window.
- The application has no editor: the world is built by `main.gd` at run time, so the editor's 3D
  view would be empty, and `godot-projects-browser.mjs` tests what the editor shows of a game.
- Quitting while the engine's looping `AudioStreamWAV` played made Godot print "2 ObjectDB instances
  were leaked at exit" (the stream and its playback): the game stops its sounds and quits 0.3 s later.

## Done when

The game image builds, and its test passes in Chrome on gpu@0 (and Firefox where it has an
adapter). Every new video plays from the demos page in headless Chrome and Firefox, each with a
poster, a plain section, and a README of how it was made (`work/videos-2026-11-14/NAME/`).
