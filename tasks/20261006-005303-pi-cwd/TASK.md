# Pi starts in / instead of /workspace

- STATUS: OPEN
- PRIORITY: 320
- TAGS: pi,pi-local,agent

`pi` and `pi-local` start Pi from `/etc/dolly/init.slop`, which `/bin/slop`
runs non-interactively; only an interactive Slop moves to `/workspace`
(`src/slop.c` `interactive()`). So Pi's working directory is `/`: its footer
shows `/`, its system prompt ends `<cwd>/</cwd>`, and every `bash` tool call
starts in `/`, while `SYSTEM.md` says "Work in `/workspace`". The recovery
shell after Pi exits is in `/workspace`, so the two disagree.

Seen in task `20261005-215204-pi-local-loop`: the 2B and MiniCPM5 models ran
`cd /workspace && cc -o hello hello.c` in one call and `./hello` in the
next, which runs in `/` and fails (`slop: ./hello: command not found`), and
`pwd` answers `/`. Starting Pi from `/workspace` (one `cd /workspace` at the
top of `init.slop` in `demos/pi/Dollyfile-pi`) removes that trap; with it,
8 runs of the compile task still failed twice for other reasons, so it is
not the loop's cause.

## Done when

- Pi started by an image's ENTRY runs in `/workspace` (footer and
  `<cwd>`), in `pi`, `pi-local` and Studio; a browser test checks it.
