# The HTTP-synced folder as a demo video

- STATUS: OPEN
- PRIORITY: 400
- TAGS: http,demo,recording,0.1.6,owner,overnight

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
