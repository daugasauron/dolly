# The x11 workbench as a demo video

- STATUS: CLOSED
- PRIORITY: 410
- TAGS: x11,demo,recording,0.1.6,owner

Owner (2026-11-13): "I want to record this whole thing as a demo video." Part 2 of
`20261112-223154-x11-workbench`, after part 1 works; done with Fable 5.2, as part 1.

## Do

Record the sequence of part 1 as the earlier videos were made (`work/videos-2026-11-12/*/README.md`:
a take scripted in Chrome, speed-ups named in a caption bar), with its poster, and add a section to
the demos page (`sites/slopshare.dev/agents/index.html`) with a line of what it shows.

## Done when

The video and poster are in `sites/slopshare.dev/agents/` within Pages' 25 MiB a file
(`test/site-release.test.mjs` passes), the section is on the page, and the release of 0.1.6 has it.

## State (2026-11-13)

Recorded, cut and on the demos page; left: the release of 0.1.6 carries it.

- `sites/slopshare.dev/agents/videos/x11-workbench.mp4` (2:30, 1920x1080, 7.4 MiB) and
  `posters/x11-workbench.jpg`, with the section "X11: a terminal workbench, installed as it
  goes" after Wine's; `test/site-release.test.mjs` passes.
- Take 1 of `work/videos-2026-11-13/x11-workbench/record.mjs` on the tree's own build
  (`a9efb45fd`), which checked afterwards that the session held the program as typed and its
  executable. Its README has the method, the timings and the four speed-ups its captions name.
- The machine's load was 25 on 16 cores during the take: the installs and `mojo build` took two
  to five times what they took in the rehearsals (28 s against 9 s for the build), which the
  captions say. A take on a quiet machine would be shorter; `record.mjs` makes one.

## Closed (2026-11-13)

`sites/slopshare.dev/agents/videos/x11-workbench.mp4` (2:30, 7.4 MiB) is in the release 9045 serves
(`5d718da3…`, main `e6ad7707c`) and plays in Chrome and Firefox from it
(`work/evidence-2026-11-13/videos/play-all-5d718da3.log`).
