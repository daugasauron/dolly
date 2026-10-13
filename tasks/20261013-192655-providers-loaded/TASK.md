# Investigate: every provider's JavaScript is loaded on every page

- STATUS: OPEN
- PRIORITY: 105
- TAGS: core,boundary,host-modules,owner

Row B7 (C2) of [the boundary audit of 2026-10-13](../20261012-230015-audit-fable/boundary.md),
the last row of that audit that was neither fixed nor investigated. This
task investigates it and decides nothing.

Done when it holds, with the evidence and without a verdict: how the
registry came to import every provider, what a page loads today (files and
bytes, by image), each claim below checked, what loading a provider only
when its module is enabled would mean on real cases, and what could not be
found out.

## What the audit claims and proposes (2026-10-13, unchecked)

- "Every provider is imported on every page (`modules.mjs:7-8`), 18 `host`
  files whether or not the image can use them."
- Its fix: "Import a provider's JavaScript when its module is enabled, not
  at registry load (`host/modules.mjs:7-8`): a `default` page then loads no
  GPU, audio, microphone or buttons code, and `enable()` already has the
  await for it." Cost: "cheap".
