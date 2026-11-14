# Videos that show what Dolly can do: a Godot voxel flyover and three more

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: 0.1.6,demo,recording,godot

Owner (2026-11-14): "I want you to use fable5.2 to create more videos. I think this environment is
incredibly powerful and quite cool, I want you to demonstrate the power of it. I want one video
where godot is used to create a REALLY COOL visually striking 3d game with shaders/gpu etc. I like
the "Voxel flyover" idea. For other videos, be creative."

Branch `feature/videos-0.1.6` (`work/vids`), from main `ee42c5982`. Brief:
`work/briefs-2026-11-14/videos.md`.

## State (2026-11-14, 14:00)

Done: the game (`f952c275b`, `eedf424c1`) and three videos (`aa3192807`, `b89f6289c`), each with
its poster and a section in the group at the top of `sites/slopshare.dev/agents/index.html`, and
each played a second from the page in headless Chrome 156 and Playwright's Firefox 155 with its
1920 by 1080 frames decoded (`work/videos-2026-11-14/voxel-flyover/plays.mjs`, `plays.log`):

- `voxel-flyover.mp4` (2:18, 22.0 MiB): the game from dawn into night, the helm, the project's
  lines and the world's function. `work/videos-2026-11-14/voxel-flyover/README.md`.
- `local-model.mp4` (1:09, 1.9 MiB): Pi on Qwen3.5-2B in the `pi-local` image writes, compiles and
  runs a C program; all 347 of the page's requests went to the local server.
  `work/videos-2026-11-14/local-model/README.md`.
- `session-travel.mp4` (1:00, 1.6 MiB): a session with a compiler and a compiled program saved in
  Chrome, exported, imported in Firefox and run there, the two side by side.
  `work/videos-2026-11-14/session-travel/README.md`.

Not made: Pi changing the game's world through OpenRouter. The key was refused that day (401,
the integrator's message); the script and prompt are ready and unrun in
`work/videos-2026-11-14/pi-world/`, with a README of how to record it. Xonotic was tried and
dropped (below).

Left for the integrator: the core browser suite and the round's GPU tests on the merged tree. The
page's lead paragraph does not name the new recordings (the npm agent edits the same page).

## The game

How it works is in `demos/godot/README.md` ("Voxel Flyover"). `demos/godot/voxel-flyover` is a
Godot project of scripts and shaders; the package `voxel-flyover` and the application
`godot-voxel-flyover` build in 37 to 43 s on the release candidate's images (the editor imports and
exports the pack), and `godot-voxel-flyover` is in `config/domain-pages-images.txt`.
`demos/godot/test/godot-flyover-browser.mjs` passes on the RTX 5070 in Chrome 156 (42.3 frames a
second in a 1600 by 900 page on Xvfb) and the installed Firefox (59.0). Decisions:

- The world is a function in the shaders, not meshes built in GDScript: GDScript in Wasm is
  about four times slower than native, and a grid of instanced boxes raised by the vertex stage
  costs the CPU nothing a frame. `terrain.gd` repeats the function for the flight; the hash is
  integer arithmetic so both agree.
- Measured (Chrome 156, 1920 by 1080 frames, an early build): 4.9 ms of GPU and 0.5 ms of render
  CPU a frame by Godot's own measure. The frame rate on Xvfb follows the page's size and not the
  scene: 35 in a 1920 by 1000 page, 36 at 1600 by 900, 49 at 1280 by 720, 60 at 960 by 540, and the
  same 33 to 38 with grids a sixteenth the size, without SSAO and volumetric fog, or with two
  shadow cascades. Headless Chrome has no adapter here, so a recording is of the Xvfb window.
- The application has no editor: the world is built by `main.gd` at run time, so the editor's 3D
  view would be empty, and `godot-projects-browser.mjs` tests what the editor shows of a game.
- Quitting while the engine's looping `AudioStreamWAV` played made Godot print "2 ObjectDB instances
  were leaked at exit" (the stream and its playback): the game stops its sounds and quits 0.3 s later.

## Found on the way

- Xonotic, tried as a video and dropped: on gpu@0 the client drew a deathmatch with six bots on
  stormkeep at the high effects preset at 60 frames a second at 1280 by 720 and 45 at 1920 by 1080
  while recorded (RC on 9045, Chrome 156). But an observer who spectates a player (`cmd spectate`,
  then the fire button) gets that player's health, armour and hints while the view stays where the
  observer was: the camera does not follow the spectated player (takes 1 to 3 in
  `work/videos-2026-11-14/xonotic/`, deleted; `record.mjs` reproduces it). Not looked into; it belongs
  to `tasks/20261006-122433-xonotic`. The welcome dialog's Join takes any click.
- A plain `npm run image` stages every image's sources again and wrote 11 GB under `build/` of this
  tree before it was stopped (`build/codex-sources`, `rust-sources`, `go-port`, ...; removed). With
  the pins current, `node scripts/generate-routes.mjs` and `node scripts/build-system-snapshot.mjs`
  alone restored the catalog of 230 images from the cached ones in under a minute.

## Done when

The game image builds, and its test passes in Chrome on gpu@0 (and Firefox where it has an
adapter). Every new video plays from the demos page in headless Chrome and Firefox, each with a
poster, a plain section, and a README of how it was made (`work/videos-2026-11-14/NAME/`).

## Closed (2026-11-14)

The done-when holds at `b89f6289c`: `godot-voxel-flyover` builds and
`demos/godot/test/godot-flyover-browser.mjs` passed in Chrome 156 and the installed Firefox on the
RTX 5070 (`eedf424c1`); the three videos play from the demos page in headless Chrome 156 and
Firefox 155, each with a poster, a section and a README; the source suite passes (394). The
OpenRouter video waits for a key that works and is described where its script is.
