# Audit handoff

Open work as of 2026-09-10. Completed audit narratives are in Git history;
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

## Rust, Codex and RTS

The system now includes ripgrep and fd, compiled from Rust source inside Dolly
with C Patti. Pi and Studio inherit both. The Rust compiler is the explicit
external seed; see [sources](sources.md#rust-compiler-seed-and-source-built-tools).

The full [Codex TUI](codex.md) runs with current-thread Tokio, real shell tools
and device-code sign-in. Browser tests use synthetic OAuth/model responses;
real account inference is not established. ChatGPT's model and Responses
endpoints reject a clean browser's CORS preflight. A reviewed transport remains
necessary for that backend. Socket-based MCP clients, application threads and
native OS sandbox hooks remain unsupported.

The [RTS handover](rts-handoff.md) records integration and outstanding replay,
input and transport limits. The optional Pi relay does not configure Codex's
own model transport.

## Checkpoint and preservation

The domain retains the full catalog from `ade9f99` (`pages-ade9f99-r1`).
GitHub Pages uses the smaller catalog from `21eb832` (`pages-21eb832-r1`),
including RTS Arena but excluding Codex. Both use the same application code;
image selection is packaging configuration, not a source fork.
Release procedures and delivery checks live in [deployment](deployment.md).

Port 9000 serves `build/releases/current`;
`release/source.commit` identifies its source, not later documentation commits.
Keep old pinned releases, user caches, `.pi/`, `.pi-subagents/`, `work/`,
`build/d6-source-cache-backup.v3dj1y` and failed-test evidence.
Do not replace a served release with mutable source or `dist/`.

Existing proofs do not establish full POSIX/Node/libcurl compatibility,
Safari/phone/audio support, complete cleanup after forced termination or a
formal containment proof.
