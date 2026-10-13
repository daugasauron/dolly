# Investigate: the HTTP broker strips credentials by a list of six header names

- STATUS: OPEN
- PRIORITY: 200
- TAGS: core,boundary,http,owner

The one weakness of [the boundary audit of 2026-10-13](../20261012-230015-audit-fable/boundary.md)
(W5; row B5 of [the audit](../20261012-230015-audit-fable/TASK.md)) that was
neither fixed nor investigated. It is on the network edge, which
`AGENTS.md` names the security perimeter: "Destination, credential,
redirect, quota, and approval policy belongs to its browser-side provider
and must remain enforceable after complete Wasm compromise." This task
investigates it and decides nothing.

Done when it holds, with the evidence and without a verdict: how the list
came to be (commits, tasks, the owner's words), what the broker does with a
credential on each kind of rule today, each claim below checked, what a
change would mean on the real destinations the images use, and what could
not be found out. The owner decides what, if anything, follows.

## What the audit claims and proposes (2026-10-13, unchecked)

- "Credential stripping is a six-name list (`host/http/policy.mjs:8-15`). A
  hardened rule without `credentialHeaders` still lets `private-token`,
  `x-auth-token` or a bearer in a custom header leave, to that rule's
  destination only. The code says "common" (`policy.mjs:244`)."
- Its fix: "say so in `docs/http.md`, or give" a rule an allow list of the
  headers it lets through (the row in the audit's table: "a sentence, or an
  allow list").
