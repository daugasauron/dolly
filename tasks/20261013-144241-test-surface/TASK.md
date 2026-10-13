# The test surface leaves the product: __dolly, terminal-text.mjs and the shell's published result

- STATUS: OPEN
- PRIORITY: 285
- TAGS: core,boundary,tests

Owner (2026-10-13): "I want to get the core right, Dollyfile syntax, host
modules/bridge, browser runtime etc. It should be as clean and small as
possible in order to be extensible. Think unix philosophy (this is a core
thing)." One issue of
[the reflection on the direction](../20261013-142800-direction/TASK.md)
([reflection](../20261013-142800-direction/reflection.md), section 4).

Done when: a page a visitor loads defines no `__dolly` and loads no code
that exists for tests; the tests inject what they drive the page with; the
process contract has no operation that exists for them; every suite passes
in Chromium and Firefox.

## As filed (2026-10-13, main `e330d782`)

- `window.__dolly` is defined on every page (`src/browser.mjs:226-230`), 24
  members with every module enabled; `src/terminal-text.mjs` (63 lines) and
  input's `submit`, `input`, `paste`, `key` (`host/input/input.mjs:489-495`)
  exist for tests; sixty-three test files use it, and outside tests two
  release scripts. Not reachable from Wasm.
- In the contract for the same purpose: `TERMINAL_PUBLISH_RESULT` and two of
  the six words of the terminal's mailbox (`abi/dolly-supervisor-0.wat`),
  produced only by Slop (`src/slop.c:5269`), consumed only by `submit()`
  (`host/input/input.mjs:284`).
- Two steps, the first with no image input: (1) the page side moves to a
  module the test harness injects; (2) the operation and the mailbox words
  leave the contract and Slop, which changes the seed and waits for its
  branch. The older task is
  [audit-24](../20260930-100000-audit-24/TASK.md); fold what it still holds
  into this one when step 1 is done.
