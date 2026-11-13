# The HTTP-synced folder as a demo video

- STATUS: OPEN
- PRIORITY: 400
- TAGS: http,demo,recording,0.1.6,owner,overnight

## State (2026-11-13, `feature/rclone-video`)

Recorded and on the demos page: `sites/slopshare.dev/agents/videos/rclone-sync.mp4` (1:57, 1920x1080,
2.6 MiB) and `posters/rclone-sync.jpg`, with a section after the X11 workbench's. Take 2 on the
default image of the release 127.0.0.1:9045 served at 22:26 (main `e6ad7707c`), beside this
machine's terminal running upstream's rclone 1.76.0 with the README's flags; the way it was made is
in `work/videos-2026-11-14/rclone/README.md`. The tree's file plays a second from the demos page in
Chrome 156 and Firefox 155 (`plays.mjs`), and `node --test test/site-release.test.mjs` passes.
Left: the integrator plays it from the packaged release's `/agents/` in both browsers.

Owner (2026-11-13): "Add an overnight task to create a demo video of this", the folder a server
on this machine shares with a Dolly session (`20261112-223154-http-mount`, `demos/rclone`).

## Do

Record, as the earlier videos were made (`work/videos-2026-11-12/*/README.md`,
`work/videos-2026-11-13/x11-workbench/`): this machine serves a folder with upstream rclone's
`serve webdav` as `demos/rclone/README.md` gives it; on the release served at 127.0.0.1:9045 a
session runs `amy install rclone`, configures the remote and runs `rclone bisync`; then files
change on both sides and meet: one written on the machine shows up in the session, one written
in the session (a program's output, an edited file) shows up on the machine, a deletion carries
over, and the ten-second loop keeps them in step without a command. Show the machine's side as
a terminal beside the browser; captions say what each side does and what the broker admits.
The video and its poster go into `sites/slopshare.dev/agents/` with a section, as the others.

## Done when

The video plays from the packaged release's `/agents/` in Chromium and Firefox, its section
reads plainly, and the way it was made is in its README.
