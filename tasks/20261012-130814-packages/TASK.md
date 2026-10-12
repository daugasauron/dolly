# Everything that makes sense is a package amy installs

- STATUS: OPEN
- PRIORITY: 305
- TAGS: packages,amy,images

Owner (2026-10-12): "Break out everything (that makes sense) into packages
that are installable with amy."

## As filed

`amy-index.txt` lists 34 packages. Programs that images build and keep but
no package offers are to be listed here first (`ninja` in `system-tools` is
one), then each made a package or given its reason for staying where it is.
Related: [`lean-game-images`](../20260930-231300-lean-game-images/TASK.md),
[`package-needs`](../20261007-003116-package-needs/TASK.md),
[`qwen-shards`](../20261008-234448-qwen-shards/TASK.md).

Done when: the list is here with a decision per row, the packages exist,
install into `default` with `amy`, and run.
