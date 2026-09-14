# Stop advertising a smaller context window through the Codex relay

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: bug,agent,performance

The restored Blockwalker Pi session spent roughly nine minutes compacting its
conversation before taking its first action. The completed compaction at
2026-09-14 16:00:32 UTC saved a 47,316-character summary. After only a few
boat-design tool calls, another summary request began at 16:01:49. The world
continued simulating, but the agent appeared unresponsive.

The relay advertised 65,536 context tokens regardless of the local Codex
catalog's value (272,000 for Astra). Pi's default 16,384-token response reserve
triggered compaction near 49,152 tokens; its retained history and large summary
quickly filled the available space again. This cap is model metadata, separate
from Dolly's HTTP byte limits. A small independent Astra/xhigh request through
the same running relay completed in 2.125 seconds, with HTTP 200 and a completed
SSE response. No authentication or transport failure was established.

Forward the catalog's context window unchanged. Preserve Astra/xhigh, automatic
compaction, and the three-image observation window. Verify metadata handling,
then re-import the updated private model configuration and resume the saved
conversation in the actual browser. Record whether it can progress beyond the
old threshold without repeatedly compacting. Preserve the full conversation and
world throughout migration.

Also found that the game listened for obsolete `auto_compaction_start/end`
events. The installed Pi SDK emits `compaction_start/end`, so no status appeared
during the nine-minute pause. Updated the listeners to display progress and
record the reason, cancellation/error and previous token count in the events
file. This status fix awaits a rebuilt image and real SDK compaction check.

Relay tests passed (`build/blockwalker-relay-context-test.log`). Imported the
272,000-token metadata into the fresh browser, preserving 12 survivors at world
age 6177 s and 29,654,437 bytes of full conversation in
`build/blockwalker-walking/navigation-state.tar`. The `blockwalker-islands`
session is running the navigation image and the updated model configuration.

Live evidence after migration: twelve completed Astra replies grew from 51,178
to 94,785 input-plus-cache tokens without a new compaction. The first programmed
boat was released and remained afloat at 114 simulation seconds. Evidence:
`build/blockwalker-context-progress.log` and the full saved conversation.
A separate short browser probe did not trigger compaction within its two-minute
window, so it did not verify the notification path. Keep this issue open for
that remaining check; do not report that probe as passed.

A real threshold compaction started at 2026-09-14 17:01:57 UTC in the updated
`blockwalker-cranes` image. The new `compaction_start` handler emitted and saved
its reason correctly. It is still running as of 17:09:12 (27 requests, 26
completed); await the end event before closing the remaining notification check.

At 17:11:57.104 UTC the real `compaction_end` handler recorded and displayed
`Auto-compaction failed: Summarization failed: Browser HTTP deadline exceeded`.
This verifies the actual start and error/end notification paths. A normal agent
request followed at 17:11:57.520; the game continued simulating. The metadata and
notification task is complete. The separate ten-minute summary deadline failure
is tracked in `tasks/20260915-021300-codex-01/TASK.md`; do not claim compaction
itself succeeded. Full state was saved by `blockwalker-cranes-monitor.mjs`.
