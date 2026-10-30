# Tab completion offers nothing after ~/.pi/a, but completes ls /b

- STATUS: OPEN
- PRIORITY: 150
- TAGS: bug,pi

Owner (2026-10-31), in the npm demo (`pi-minimal`, `@daugasauron/*@0.1.4-rc.3`, served by
`~/dev/dolly-demo`): Tab completes `ls /b`, but after `~/.pi/a` it offers nothing, where
`~/.pi/agent` exists. Not yet reproduced or looked into.

To find out first: which program completes (Pi's editor or Slop after Ctrl+D), and whether it is
the `~` (completion not expanding it) or the dot directory (hidden entries left out); `ls ~/.pi/`
then Tab after `/home/dolly/.pi/a` separates the two.

Done when Tab completes a path under `~` and under a dot directory as it does under `/`, with a
browser test of it.
