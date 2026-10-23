# Audit of the core after the 0.1.4 work: small and well thought out

- STATUS: OPEN
- PRIORITY: 280
- TAGS: core,audit,architecture,0.1.4

Owner (2026-10-23): "go ahead and audit stuff its very important to keep the core small and
well thought out", after "llvm should always be useful?" on the seed compiler's report that
the `llvm` package now duplicates `cc` and that the recipes building the core's compiler live
in `demos/`.

What changed today and is audited: the host registry from the embedding and device modules
that import only their own files (`main`); `boot()`, images under their own base and the npm
packages (`main`); `touch@0` replacing `buttons@0` (`core/touch-module`); the seed taking the
compiler built in Dolly (`core/seed-compiler`); the environment audit's fixes
(`core/audit-fixes`, in progress); the Janis installer (`demo/janis-install`).

Done when: the findings are in `audit.md` here, each fixed before the 0.1.4 round where the
fix is clear, or one line for the owner where it is a decision.

## Progress

- 3, 4, 5, 7, 8, 9, 10, 12 (the image directory line, `terminal-text.mjs`): fixed in 96b61bed,
  verified in Chromium and Firefox (commit message lists the suites). Found on the way: the
  custom session suite failed in today's Chromium writing a 151 MB legacy ArrayBuffer record
  into IndexedDB; that record format can no longer be read (its key's image build ID is gone),
  so the fallback and its test step went.
- 1, 2, 6, 11 (the wake loop): done at the merges, in the audit's order (`a588d3d4`,
  `3c5b78b0`, `b0f65b9c`, `842b78ed`): input@0's Paste styles itself, `serviceOnNotify` in
  the runtime, AGENTS.md's seed sentence, sbase's `which` kept with `command -v` in the
  guidance. Version 0.1.4 in `2ee36c90`; the catalog round started 18:09 on that commit and
  verifies them in a browser.
- Owner: the three lines at the end of `audit.md`.
