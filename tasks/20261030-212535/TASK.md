# Tab completion offers nothing after ~/.pi/a, but completes ls /b

- STATUS: CLOSED
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

## Closed (2026-11-01)

Slop, and `~`. Reproduced in Chromium on main's `pi-minimal`: Pi's editor completes `ls ~/.pi/a`
to `~/.pi/agent/`; after Ctrl+D, Slop completes `ls /home/dolly/.pi/a` but neither `ls ~/.pi/a`
nor `ls ~/.p`. `collect_completions` opened the directory `~/.pi` literally; hidden entries were
never the cause (they are offered once the typed name starts with `.`, as in Bash). A leading `~/`
now completes under `HOME` and keeps `~/` on the line (`afbfff61`, branch `core/audit-slop`).
`test/shell-browser.mjs` types `cd ~/.tab-pr`, Tab, `ins`, Tab, Enter and checks `$PWD`: it
passes in Chromium and Firefox on the branch's `system` image (build of `fdee4c2b`).
