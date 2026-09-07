# Overnight release work

Original target: 2026-09-08 07:00 JST; baseline `2ccaab2`.
Work is paused at the user's requested checkpoint. Application `4b61edf` is
published locally on port 9000; all 19 images passed packaged inventories.
The latest source checkpoint passes 258 tests. No public deployment or hosting
purchase is part of this work. See [audit handoff](audit-handoff.md) for exact
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
  and model recovery do not. Preserve failed evidence.
- [x] Research classic bhop courses and add Foundry: smaller spaced platforms,
  touch-triggered collapse, distinct routes and an industrial map. Actual browser
  play verifies movement, landing and collapse timing.
- [ ] Finish the source/artifact/privacy review. All images and relevant browser
  suites pass; personal CPython paths and archive-writer bugs are fixed. The
  expanded scan classifies certificate fixtures, but is not an exhaustive audit.
- [x] Prepare provider-neutral static export with separable immutable assets.
  Nested-path and headerless browser boot/build/session checks pass. Production
  provider choice, old-release retention and cold-load measurement remain open.
- [ ] Complete the independent Codex experiment without changing main or the host
  contract. Clean checkpoint `64d6d44` runs genuine AuthManager/API-key and
  Responses components in the browser, not a full agent. Higher-level auth,
  ConfigBuilder and native socket/thread dependencies remain unported.

Preserve the last complete local release while building. Publish only validated
catalogs and retain old release assets for open tabs. Experimental browsers and
the Codex subagent are stopped; port 9000 remains available.
