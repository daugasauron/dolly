# Overnight release work

Original target: 2026-09-08 07:00 JST; baseline `2ccaab2`.
All 19 replacement images are built and 260 source tests pass; browser checks
validate the build-stdin fix, including Studio, Python, Pi, Neovim and Git.
Application `ac13356` stays on port 9000 until packaged inventories pass.
No public deployment or hosting purchase is part of this work.
See [audit handoff](audit-handoff.md) for exact
release identity, evidence and remaining issues; unchecked items are unfinished.

- [x] GPU setup guidance beside the model picker, unavailable-adapter tests and
  a real Chrome GPU load. No silent flags or remote fallback.
- [ ] Genuine fd/ripgrep in every Pi image, resolved from PATH. Resolve the Rust
  bootstrap boundary and upstream threading requirements.
- [x] Deterministic home-page ordering, default first then alphabetical.
- [x] Studio submits approved recipes through the existing HTTP broker to an
  isolated in-browser build, streams bounded logs/errors and opens successful
  output in another tab. Approval, denial and cancellation are browser-tested.
- [ ] Manually validate local Pi independently authoring, building, debugging and
  launching a correct image. Guided Qwen 4B starters pass; independent workflow
  still fails after the Qwen history fix and shorter, template-first guidance.
  Forced cancellation can unload the model; explicit reload restores tool use.
  Building/opening a result is now demonstrated, but its program failed actual
  input/output tests. A later trial exposed a real noninteractive-build stdin
  hang; `/dev/null` fixes it without changing the host ABI. The real-browser
  Studio regression passes, but independent agent correctness remains unproven.
  Preserve failed evidence.
- [x] Research classic bhop courses and add Foundry: smaller spaced platforms,
  touch-triggered collapse, distinct routes and an industrial map. Actual browser
  play verifies movement, landing and collapse timing.
- [ ] Finish the source/artifact/privacy review. All images and relevant browser
  suites pass; personal CPython paths and archive-writer bugs are fixed. The
  expanded scan classifies certificate/archive fixtures; pin updates now preserve
  matching path/comment text. This is not an exhaustive audit.
- [x] Prepare provider-neutral static export with separable immutable assets.
  Nested-path and headerless browser boot/build/session checks pass. Production
  cold/warm transfer is measured. Provider choice, old-release retention and
  realistic network/load testing remain open.
- [ ] Complete the independent Codex experiment without changing main or the host
  contract. Clean checkpoint `afde252` runs production TOML/CLI/managed-requirement
  auth bootstrap, cloud/configuration factories and the shared HTTP-construction
  seam with Responses, not a full agent. ConfigBuilder/ModelClient/core and native
  socket/thread dependencies remain unported.

Preserve the last complete local release while building. Publish only validated
catalogs and retain old release assets for open tabs. The Codex experiment is
paused; manual Studio evidence and its cached profile are retained.
Port 9000 remains available.
