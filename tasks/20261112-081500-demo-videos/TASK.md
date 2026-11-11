# The demos page of 0.1.6: two new videos, and every earlier one actually in the release

- STATUS: OPEN
- PRIORITY: 330
- TAGS: 0.1.6,demo,recording,release,site

Owner (2026-11-12): "I want 2 new demo videos. One video that showcases the c compiler in wine to
create some fun program, and one video that creates the bhop game in godot (the one that becomes an
image). Make sure they are not forgotten to be included in the release."

## State (2026-11-12)

Owner (2026-11-12): "Just add all the videos to git ?" Done in `92d7d3aa4`:
`sites/slopshare.dev/agents/` is v0.1.5's page (34 videos, deployed in place then) with the Truck
Town section, 37 videos, every file within Pages' 25 MiB (`test/site-release.test.mjs` passes). The
Wine video is being recorded; the Godot one waits for `20261112-075500-godot-bhop`.

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
