# Audit handoff

Open work as of 2026-09-08. Completed audit narratives are in Git history;
this file is the remaining-work list, not a release diary.

## Next fix: shell cancellation

Ctrl+C stops the child but Slop can still execute the rest of a list or serial
pipeline. The stock default image reproduces:

```sh
sleep 30 | /bin/slop -c 'echo wrongly-ran > /workspace/after-interrupt'
```

The same problem affects `(sleep 30) | ...` and `sleep 30; ...`.
`dolly_wait` discards termination-signal metadata available through `waitpid`.
Propagate real signal termination through lists, pipelines and nested shells;
an ordinary `exit 130` must not be treated as a signal.

Reproduce with `node build/pipeline-interrupt-probe.mjs` (also accepts
`compound` or `list`). Evidence: `build/pipeline-interrupt-browser-red.log`
and `build/pipeline-interrupt-{compound,list}-browser-red.log`.
Cover descriptor cleanup and prompt recovery.

## Other correctness gaps

- **Tar roots:** the extractor in `modules/tar.dm` rejects ordinary `./`
  and `./file` entries from `tar -cf archive -C DIRECTORY .`. Normalize safe
  leading components and directory root markers without admitting traversal
  or treating the root as a regular file.
  Evidence: `build/ripgrep-probe.OHvH0j/browser-link.log`.
- **Custom-image persistence:** result URLs refer to this browser's artifact
  cache, not portable images or named sessions. Standard session file export/
  import works; custom-image saves and cross-build migration do not.
- **Local Pi reliability:** guided starters pass, but independent Qwen author/
  build/debug tasks still produce invalid recipes or incorrect programs.
  One successful build's line counter returned 0 for two input lines.
  Preserve `build/studio-manual-evidence/studio-pi-edit-{default,sampling,repair}.jsonl`
  and `build/studio-pi-edit-sampling-correctness-final.log`.
  Compilation and model tool calls are not correctness checks.
- **GPU recovery:** cancellation may unload the model; explicit cached reload
  restores use while the filesystem survives. A slow cached 2B load remains
  unexplained (`build/gpu-load-phase-first.log`). Pi JSON mode can report a
  model-error event with exit 0 upstream; inspect events, not just exit status.

## Ports and larger follow-ups

- **ripgrep/fd:** neither genuine tool is installed. A ripgrep 15.1 probe passes
  browser search, Unicode, ignore rules, pipes, mmap, statuses and cancellation.
  Rust objects were compiled externally; Dolly compiled three missing upstream
  pthread-attribute functions and linked them. This is not an in-Dolly Rust build.
  Reproduction lives in `build/ripgrep-probe.OHvH0j/`, especially
  `browser-direct-cancel.log`. Packaging still needs
  `pthread_attr_init/setstacksize/destroy` in the process archive, isolated Git
  version discovery and remapped source paths. These helpers do not implement
  threads; fd's single-thread option still creates them.
- **Studio split panes:** tmux is not installed. It needs in-Wasm PTYs, local
  Unix IPC, ncurses/libevent and a deliberate spawn-based port of fork sites.
  The probe in `build/studio-porting-probe.log` finds no `/dev/ptmx` and
  `socketpair` returns ENOSYS. Do not add outer host capabilities.
- **Python:** broaden native-extension coverage and define public wheel/SOABI
  compatibility. NumPy/Pandas source builds have passed; arbitrary packages and
  full resolver backtracking are not supported. See [ports](port-status.md).
- **Release operation:** exercise WAN/load behavior and maintain a bounded,
  explicit predecessor-retention policy. Static-only Cloudflare Pages is
  deployed, not awaiting provider selection. Avoid full rebuilds for small
  leaf changes; inspect current disk usage instead of relying on old timings.

## Isolated Codex experiment

Branch `codex/wasm64-native-agent-20260907` is paused at `e9b8c4f`;
its worktree's `CODEX-HANDOFF.md` has reproduction details. No experimental
Rust patches were merged into main.

Selected upstream policy, configuration, auth/model-manager and Responses/SSE
components pass browser probes with the unchanged outer ABI. Rust compilation
is external. **The full agent does not run:** CLI/core construction, Tokio
socket dependencies, native transport and SQLite workers remain. There is no
in-Dolly Rust SDK; unsupported auth modes fail explicitly.

## Checkpoint and preservation

The audited application source is `32d3b34`, release asset
`pages-32d3b34-r1/dolly-pages.tar.gz`, SHA-256
`fbb6d1fe6673e97125ba17a2335b1f07719767aa1a2fe5c20a7dd7a60287023b`.
GitHub Pages and daugasauron.com use the same application artifact.
Release procedures and delivery checks live in [deployment](deployment.md).

Port 9000 serves `build/releases/current`;
`release/source.commit` identifies its source, not later documentation commits.
Keep old pinned releases, user caches, `.pi/`, `.pi-subagents/`, `work/`,
`build/d6-source-cache-backup.v3dj1y` and failed-test evidence.
Do not replace a served release with mutable source or `dist/`.

Existing proofs do not establish full POSIX/Node/libcurl compatibility,
Safari/phone/audio support, complete cleanup after forced termination or a
formal containment proof.
