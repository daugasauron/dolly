# The demos page of 0.1.6: two new videos, and every earlier one actually in the release

- STATUS: OPEN
- PRIORITY: 330
- TAGS: 0.1.6,demo,recording,release,site

Owner (2026-11-12): "I want 2 new demo videos. One video that showcases the c compiler in wine to
create some fun program, and one video that creates the bhop game in godot (the one that becomes an
image). Make sure they are not forgotten to be included in the release."

## State (2026-11-12)

Filed. The Wine video is being recorded; the Godot one waits for `20261112-075500-godot-bhop`.

Found: the release's demos page is `sites/slopshare.dev/agents/` (copied by
`scripts/package-domain.mjs`), which holds two videos in git (Dollyfile Studio, RTS Arena). v0.1.5's
34 videos (`work/videos-2026-11-01/site-agents/`, 468 MB) were added to the deployed v0.1.5 in
place, and Truck Town (`work/videos-2026-11-08/cuts/`, `site-agents-preview/`) was never released.
So a 0.1.6 packaged as today would show two videos.

## Do

- Video 1: in `wine`, a small fun Win32 program written in Notepad, compiled by TinyCC under
  `x86emu`, and run.
- Video 2: the Godot Airtime of `20261112-075500-godot-bhop` made in Godot's editor in Dolly and
  becoming the image, then played.
- The page and packaging take every video: the v0.1.5 set, Truck Town and these two, from one
  place outside git with each file pinned by SHA-256 in git, checked by `package-domain.mjs` (each
  file within Pages' 25 MiB, as `test/site-release.test.mjs` checks).

## Done when

`bash scripts/package-pages.sh build/domain-releases slopshare.dev` produces `/agents/` with all
of them, each plays in Chromium and Firefox from the local release, and the release checklist in
`docs/deployment.md` names the media step.
