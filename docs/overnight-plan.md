# Overnight release work

Target: 2026-09-08 07:00 JST. Baseline: `2ccaab2`; all 19 images are published
locally, but local-model starters are not yet reliable. No public deployment
or hosting purchase is part of this work.

Feature work is paused at the user's requested checkpoint. Source `026ec83`
contains the browser-tested SIGCHLD/tar fixes; all 19 fresh-runtime snapshots and
the complete 253-test suite passed. Final Python-path and Studio-skill cleanup
also passes its image refresh, all 254 tests and targeted browser checks.
Whole-catalog local publication remains. See the audit handoff for the
served checkpoint and final verification logs.
Unchecked items below remain unfinished, not implicitly included in the checkpoint.

- [x] GPU setup guidance beside the model picker; test unavailable adapters and
  a real Chrome GPU load. Do not silently change flags or use a remote fallback.
- [ ] Genuine fd/ripgrep in every Pi image, resolved from PATH. Check upstream
  tool behavior and Pi startup/search; document any Rust bootstrap boundary.
- [x] Deterministic home-page ordering, default first then alphabetical.
- [x] Studio submits recipes through the existing HTTP broker to an isolated
  in-browser build, receives bounded live logs/errors, and can open successful
  output in another tab. Review approval, resource limits and the single boundary.
- [ ] Manually exercise local Pi in Studio: read the skill, author a real recipe,
  build it, inspect errors, fix them and launch the result. Keep failed evidence.
- [x] Research classic bhop courses; expand Airtime with smaller spaced platforms,
  touch-triggered disappearing platforms, distinct routes and an industrial map.
  Verify strafe movement, landing/collapse timing and actual browser play.
- [ ] Audit the final source/artifacts for correctness, shortcuts, temporary state,
  personal data and secrets. Run all images and relevant browser suites.
- [ ] Prepare provider-neutral static deployment and separable immutable assets;
  research current hosting limits/costs, verify caching/CORS/integrity and avoid
  committing to a provider before the user chooses.
- [ ] Manage the independent `codex/wasm64-native-agent-20260907` experiment.
  No main-tree mutations or host-contract changes; report genuine measured
  progress/blockers, not a launcher or shim advertised as working Codex.

Preserve the last complete local release while building. Publish the whole
catalog after validated milestones; retain old release assets for open tabs.

GPU help, catalog ordering, Studio build/log/open and the Foundry bhop expansion
are implemented and browser tested. All three guided starters now pass with real
local Qwen 4B; default 2B and independent author/build/debug work remain unreliable.
The Codex experiment is separately checkpointed and paused at `d84e8af`; the full
agent is not running. Local-model workflow validation, fd/ripgrep and release review
remain open. See
[audit handoff](audit-handoff.md) for evidence and the isolated Codex experiment.
