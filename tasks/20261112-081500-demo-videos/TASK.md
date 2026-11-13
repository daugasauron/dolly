# The demos page of 0.1.6: two new videos, and every earlier one actually in the release

- STATUS: DONE
- PRIORITY: 330
- TAGS: 0.1.6,demo,recording,release,site

Owner (2026-11-12): "I want 2 new demo videos. One video that showcases the c compiler in wine to
create some fun program, and one video that creates the bhop game in godot (the one that becomes an
image). Make sure they are not forgotten to be included in the release."

## State (2026-11-13)

The packaged release on 9045 (`973b3ad4…`) holds 39 videos under `/v0.1.6/agents/`; each plays a
second in Chrome 156 and Firefox from the packaged files (`work/evidence-2026-11-13/videos/`,
`play-all.mjs`, `play-all-file.log`). Through the local release server Chrome stalled at the first
frame of 27 of them: it answered every request whole and chunked, without ranges or a length.
`scripts/serve.mjs` answers ranges and lengths now (`81ffda9ab` and after), and through it all 39
play in both browsers (`play-all-9046-length.log` for Chrome; Firefox with each video's load
ended before the next). `docs/deployment.md` names the media step. Left: the x11 workbench's video
(`feature/x11-workbench`) in tonight's packaged release, played the same way; then closed.

## State (2026-11-12)

Owner (2026-11-12): "Just add all the videos to git ?" Done in `92d7d3aa4`:
`sites/slopshare.dev/agents/` is v0.1.5's page (34 videos, deployed in place then) with the Truck
Town section, 37 videos, every file within Pages' 25 MiB (`test/site-release.test.mjs` passes).
Video 1 is in (`feature/videos`): `wine-tcc.mp4` (1:18, 7.7 MiB) and its poster, a section "Wine: a
C compiler on its desktop"; how it was made is in `work/videos-2026-11-12/wine-tcc/README.md` (a
take scripted in Chrome, typing past the first 12 s at 12x as its caption says).
Video 2 is in (`feature/video-godot`): `godot-airtime.mp4` (2:10, 16.0 MiB) and its poster, a
section "Airtime: a game changed in Godot's editor"; how it was made is in
`work/videos-2026-11-12/godot-airtime/README.md` (the `godot-airtime` image: the editor recolours
the foundry's sea in `foundry.gd` and `molten.gdshader`, runs it, exports the pack as the recipe
does, and `godot` plays it with the autopilot; speed-ups named in the caption bar). Found on the
way: a double click does not register in Godot in Dolly (`display_server_dolly.cpp` never sets
`InputEventMouseButton`'s `double_click`), so the editor's FileSystem dock opens a file on Enter only.

## Do

- Video 1: in `wine`, a small fun Win32 program written in Notepad, compiled by TinyCC under
  `x86emu`, and run.
- Video 2: the Godot Airtime of `20261112-075500-godot-bhop` made in Godot's editor in Dolly and
  becoming the image, then played.
- Both go into `sites/slopshare.dev/agents/` (video, poster, a section) in git.

## Done when

`bash scripts/package-pages.sh build/domain-releases slopshare.dev` produces `/agents/` with all
of them, each plays in Chromium and Firefox from the local release, and the release checklist in
`docs/deployment.md` names the media step.

## Closed (2026-11-13)

The release 9045 serves from main `e6ad7707c` (`5d718da3…`, packaged by `scripts/package-pages.sh`) holds
39 videos under `/v0.1.6/agents/`, Wine's, Godot Airtime's and the x11 workbench's among them; each
plays a second in Chrome 156 and Firefox from it (`work/evidence-2026-11-13/videos/play-all-5d718da3.log`),
through the release server's ranges. `docs/deployment.md` names the media step.
