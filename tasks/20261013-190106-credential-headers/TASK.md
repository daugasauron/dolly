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

## State (2026-10-14, 04:15): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read `main` and
changed nothing. The integrator checked that the report holds no credential,
that the six names and the refusal of a credential in a rule are in the
first commit, the owner's decision on the default mode, and the count of
test files that name `credentialHeaders` (10). It gives no verdict. What it
found:

- The six names were born complete in the first commit (`aa0e63c0`,
  2026-08-31) with the rule field, the comment "which common credential
  headers" and the refusal of a key inside a rule ("Dolly HTTP credentials
  belong inside the sandbox"). No name was added or removed since. The
  broker never injected a key and never had an allow list of headers; no
  record weighs the two forms. Why exactly these six is not recorded:
  three of them (`api-key`, `x-goog-api-key`, `proxy-authorization`) have
  never had a sender in the tree.
- No production page sets a hardened policy. The public sites run the
  default, by the owner's decision of 2026-09-30 (`eecab3df`): "The owner
  wants every HTTP(S) destination reachable by default, with
  DOLLY_HTTP_POLICY as the configurable restriction." In that mode nothing
  is stripped, and the documents say in bold that it does not prevent
  exfiltration. Hardened rules exist in about thirty tests and scripts;
  ten name `credentialHeaders`, nine of them `authorization` only.
- The audit's claims hold: a hardened rule deletes only those of the six
  that it does not name, and any other header passes to the destination the
  rule admits, and only there (a hardened rule follows no redirect).
- What the list protects, read from the code and the rule sets in use: a
  key that a client puts in one of six usual headers does not go to the
  other destinations the same page admits (a registry, a fixture), nor to a
  relay the page did not name it for. It does not protect against the
  admitted destination itself, a key under another header name, or a key in
  a query or a body. Codex's and Pi's sign-in flows carry their tokens in
  the body.
- The document says what the code does and not what a credential header
  is: a reader learns the six only from the validator's error or the
  source. "Common" stood in the documents until the rewrite of 2026-09-30.
- What the catalog's programs send as credentials is covered by the six:
  `authorization` (Pi to OpenRouter, Codex, libcurl's Basic for Git and
  `curl -u`) and `x-api-key` (Claude Code). None sends the names the audit
  gives as examples.
- An allow list of all request headers per rule, written out for the real
  clients: Claude Code needs about seventeen names and a new SDK version
  adds more; the one such list in the repository (the Codex demo's relay,
  outside the boundary) has nine and is kept by hand. A missing name shows
  as the provider's 400 or as a failed preflight that the broker can only
  report as `EIO`.
- For another origin the browser already asks the destination which
  request headers it accepts (CORS); that gate is the destination's
  choice, not the embedding's.
- Tests: the removal is tested for `authorization` and `cookie`; not for
  the other four names, and no test shows a seventh name passing.
- Not found out: any word of the owner on the list or on its form; which
  headers Pi's, pip's and npm's clients really send (a capture in a browser
  would tell).

## What the audit claims and proposes (2026-10-13, unchecked)

- "Credential stripping is a six-name list (`host/http/policy.mjs:8-15`). A
  hardened rule without `credentialHeaders` still lets `private-token`,
  `x-auth-token` or a bearer in a custom header leave, to that rule's
  destination only. The code says "common" (`policy.mjs:244`)."
- Its fix: "say so in `docs/http.md`, or give" a rule an allow list of the
  headers it lets through (the row in the audit's table: "a sentence, or an
  allow list").
