# Investigate: tests that assert wording, and the artifact test that asserts the build again

- STATUS: OPEN
- PRIORITY: 115
- TAGS: tests,hygiene,owner

Items 10 and 11 of [the hygiene report](../20261012-230015-audit-fable/hygiene.md)
of the audit of 2026-10-13 (row 29 of [the audit](../20261012-230015-audit-fable/TASK.md)),
the one row of that list that was neither done, dropped nor investigated.
`AGENTS.md`: "Do not test implementation spelling, user-facing prose or the
wording of other tests. Keep explicit ABI/capability checks and mocks that
exercise real behavior." This task investigates and removes nothing.

Done when it holds, with the evidence and without a verdict: how the rule
came to be and what was removed under it before; every assertion on wording
in the suites, each with the behaviour it stands for and whether another
assertion in the same test already proves that behaviour; what the artifact
test asserts that the build itself asserts; and what could not be found
out. The owner decides what goes.

## What the audit claims (2026-10-13, unchecked)

- "The suite tests wording, against the rule": 102 message patterns.
- "`test/dolly.artifacts.mjs` (401 lines) re-asserts the build": 250 of its
  401 lines.
