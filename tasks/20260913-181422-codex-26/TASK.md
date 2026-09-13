# Remove stale core audit claims and duplicate backlogs

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: audit,docs,core

## Evidence and result

The audit handoff still named shell cancellation as the next fix, described
custom-image sessions as unsupported, and maintained an older parallel backlog.
The process and Slop guides repeated the fixed cancellation bug. The current
real browser checks prove SIGINT propagation, ordinary exit-130 behavior and
custom save/reopen/recovery.

Removed the duplicate audit handoff. Updated the two process guides to the
implemented wait/signal contract and directed backlog links to the repo's tatr
issues. The independent local-model correctness evidence was retained in issue
27 with its historical date and unverified-current-status qualification. Existing
port/model/deployment documents retain their actual contracts and limitations;
old handoff/deployment notes remain in Git history. The task README now points
to live priorities rather than repeating priorities of already closed issues.

Checked remaining tracked links to the removed document and the changed local
Markdown targets. No runtime/image rebuild or behavioral test is required for
this documentation correction; the referenced browser checks already passed.

The first sealed-package attempt caught an additional publication gap: linked
tatr Markdown was outside the documentation publisher's allowlist. Added only
`tasks/README.md` and conventional dated task directories to that allowlist.
The real filesystem packaging regression follows the index to a task and its
source link, while continuing to reject private/unpublished paths. The failed
attempt left the previous sealed release intact; the next package is rechecked.
