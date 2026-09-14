# Make long-running game conversation compaction complete reliably

- STATUS: OPEN
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
