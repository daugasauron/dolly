# Overnight release work

Target: 2026-09-08 07:00 JST. Baseline: `2ccaab2`; all 19 images are published
locally, but local-model starters are not yet reliable. No public deployment
or hosting purchase is part of this work.

Paused at the user's 2026-09-07 checkpoint request. Application `accbf50` is
published on port 9000, with all 19 image inventories and 252 source tests passing.
The real Studio build/log/open/cancel workflow passes against that local release.
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
- [ ] Research classic bhop courses; expand Airtime with smaller spaced platforms,
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

GPU help, catalog ordering and Studio build/log/open are implemented and browser
tested. The Qwen 3.5 native tool-format fix passes source tests and two real GPU
starters; the repair starter still fails. Local-model workflow validation,
fd/ripgrep, bhop expansion and release review remain open. See
[audit handoff](audit-handoff.md) for evidence and the isolated Codex experiment.
