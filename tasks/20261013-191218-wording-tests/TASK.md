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

## State (2026-10-14, 04:30): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read `main` and
changed nothing. The integrator counted the calls again (162 `assert.rejects`
or `assert.throws` in the 41 files of the source suite), the artifact test's
length (399 lines) and the two commits. One number in it is wrong: the
parity fixture has 232 cases, as counted by loading it, not 194. It gives no
verdict. What it found:

- The rule is the owner's own commit (`67c647e7`, 2026-09-13), in today's
  words from the start; the same commit removed 65 lines that matched source
  text, a theme colour and prompt prose. Its reason, in the task it opened:
  "Source spelling often cannot establish runtime behavior and can make
  harmless refactoring expensive. Structural assertions enforcing the
  browser boundary have a distinct purpose." Under it 1,160 lines left the
  artifact test the same night, and more on 2026-09-14, 2026-10-01 and
  2026-10-13.
- Today, counted with the patterns given in the report: 162 calls in the
  source suite, about 121 with a message pattern, 28 that accept any
  exception, 13 that match a code, a name or a class. The audit's "102" is
  not reproduced by any count.
- Read one by one in nine files (89 patterns): about half are the only way
  the test tells one refusal from another, because the code throws a plain
  error with text and no code (the snapshot format's twelve, the release
  script's, the page's parser). About a third are themselves the behaviour:
  the line number of a recipe error, the declaration to add, `nena enable
  audio`, the versions named in a refusal. A few are the test's own string.
  None reads source text.
- Where a code exists it is not always used: the HTTP policy's errors carry
  an errno and its tests match `/denied/` and `/quota/`; the broker's tests
  already assert the errno.
- Three assertions in the suites still read source text: two over the
  workflow's YAML (`test/pages-publication.test.mjs:11-12`) and one that
  the kernel plugin's loader contains no `fetch(` or `eval(`
  (`test/dolly.artifacts.mjs`).
- In the browser suites the text matched is almost always a marker that the
  test's own program prints (41 of 45 in the core suite). The three page
  sentences the audit named went on 2026-10-13 (`42daf7ac`). One whole
  kernel sentence is still asserted (`test/host-modules-browser.mjs:164`).
- The artifact test: about 40 of its 399 lines assert a fact that the build
  asserts on the same bytes; the audit's "250 of 401" is not reproduced.
  What is only there is more than the three blocks the audit names: that
  the kernel exports exactly its contracts, that every import has an owner,
  the complete list of imports and the names none may have, what the seed
  holds, and the per-image rules of what an image keeps. Those are the
  facts `AGENTS.md` asks tests to prove.
- The cost the rule names, measured in history: of eight asserted messages
  traced, six were born with their test and never changed; one test was
  edited because a sentence was reworded. No record says a wording
  assertion ever caught a regression.

Done on the way (2026-10-14): an unused import left the artifact test
(`spawnSync`); its 25 tests pass.

## What the audit claims (2026-10-13, unchecked)

- "The suite tests wording, against the rule": 102 message patterns.
- "`test/dolly.artifacts.mjs` (401 lines) re-asserts the build": 250 of its
  401 lines.
