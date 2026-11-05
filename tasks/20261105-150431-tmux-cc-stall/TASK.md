# Firefox: a session's first cc stalled at preparing its 91.6 MiB executable

- STATUS: OPEN
- PRIORITY: 250
- TAGS: bug,tmux,firefox,0.1.6

## State (2026-11-06 00:10, branch `fix/hangs-1105`)

Not reproduced yet; cause not named.

Seen once, on the v0.1.5 candidate's last round (15929916a, 5 Nov 22:13-22:54, demos stage, browser
slots raised from 2 to 3 mid-stage, GPU stage not yet started): tmux's Firefox test waited its
180 s for `BUILT-0-` after `amy install cc ... && cc /tmp/size.c`. The right pane showed
"dolly: preparing 91.6 MiB WebAssembly executable for this session..." and nothing after it: the
supervisor writes "executable ready" or "executable preparation failed" when its compile
settles, so the compile of the 91.6 MiB compiler (`compileHeld`, a Worker of its own since
d130c6c45) never settled. The whole test takes 13-20 s on every earlier round (1104, 1104b, 1105,
1105b) and passed twice on rerun at 22:58 (19.7 s, 19.8 s), with the GPU stage running.

Evidence: `work/integrate/build/round-1105rc-evidence/demos.log` (lines 60-115),
`tmux-firefox-rerun-1.log`, `tmux-firefox-rerun-2.log`.

Done when the stall is reproduced, its cause named and fixed, and the test passes 20 times in a
row under a round's load.
