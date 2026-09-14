# Make long-running game conversation compaction complete reliably

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: agent,performance,network

Actual Astra/xhigh Pi compaction began at 2026-09-14 17:01:57.057 UTC and ended
at 17:11:57.104 with:
Auto-compaction failed: Summarization failed: Browser HTTP deadline exceeded.
The relay also has a 600000 ms watchdog. A normal agent request followed at
17:11:57.520, so the live game/agent process was not terminal. Preserve the full
conversation and world; do not restart solely because observation is slow.

The previous context-window/notification fix is verified: metadata now reflects
272000 tokens, and both real compaction start and failure/end events appeared.
This is a separate summary-runtime problem. Earlier summaries succeeded but
took several minutes and retained roughly 47000 characters.

Inspect the exact in-image Pi compaction implementation and request parameters.
The new saved design library can retain blueprints/controllers without repeating
them in a huge narrative summary. Investigate concise summary instructions or
other measured ways to reduce redundant context while preserving Astra/xhigh,
the complete native conversation, task requirements and useful experiment data.
Do not blindly expand the broker deadline or change the requested reasoning level.

Verify an actual compaction succeeds through the existing browser broker, then
normal tool work continues. Evidence: events.jsonl in the latest current-state
backup; build/blockwalker-compaction-finish.log. Source deadline:
scripts/codex-relay.mjs. Check browser provider deadlines separately.

## Verification, 2026-09-15 02:27 JST

Added an inline Pi compaction extension using its supported SDK hook. One
summary covers history and the split turn, preserving the previous checkpoint
and useful measurements while referring to the persistent design library for
exact blueprints/controllers. `inspect_program` also recovers the current,
possibly unreleased workshop controller. The complete native session remains
on disk. Failed or incomplete summaries leave that history intact.

The first probe exposed an SDK option mismatch: ModelRegistry.complete needs
the native `reasoningEffort` option; the simple API's `reasoning` option was
ignored. That run was rejected despite finishing quickly. The corrected run
verified Astra/xhigh in all three actual HTTP requests, including the summary.

A separate guarded Chrome/Dolly browser restored the full 65,884,160-byte state
archive and compacted its actual Pi conversation. The 112-message summary
request completed in 98,061 ms, producing a 7,407-character checkpoint and a
new compaction entry. Pi then used the real game observation tool, inspected all
17 saved creatures and the GPU frame, and reported the attached crane cargo.
Browser and relay deadlines are unchanged; no upstream Pi source was patched.

Evidence: `build/blockwalker-summary-probe.log`,
`build/blockwalker-summary-proof/summary-probe.json` and request metadata in
that proof directory. The focused probe passed under a 4 GiB/no-swap scope.
Migration into the ongoing live session remains in the larger-world task.
