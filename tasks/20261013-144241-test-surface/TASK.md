# Investigate: what every page ships for tests (__dolly, terminal-text.mjs, the shell's published result)

- STATUS: OPEN
- PRIORITY: 285
- TAGS: core,boundary,tests,owner

Owner (2026-10-13), on
[the reflection](../20261013-142800-direction/reflection.md): "The audit is
too blunt. Some of the points are good but some are garbage. Both SLOP and
RUN are needed, see the history, this is hard earned wisdom. Create tasks to
investigate each of your points more in detail without deciding if they
should go or not".

This task investigates one of its points (section 4). It decides nothing.

Done when it holds, with the evidence and without a verdict:

- how the thing came to be: the commits and tasks that introduced it and
  changed it, quoted, and the reason each gives (`git log -S`, `git log
  --follow`, `tatr find`, the closed tasks);
- what it is for today and who uses it, counted from the code and the
  recipes, not from the reflection;
- each claim of the reflection below, checked: true, false or partly, with
  what was looked at;
- what would break, be lost or become harder if it changed, and what would
  get simpler, each shown on a real case;
- what could not be found out.

The owner decides what, if anything, follows.

## State (2026-10-14, 01:55): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read
`integrate/round-1013` and changed nothing. The integrator checked where
`__dolly` is defined, the first commit's page, the one producer of the
result in Slop, the two release scripts and the quoted line of audit 24. It
gives no verdict. What it found:

- The published result is as old as Dolly and was not made for tests. The
  first commit (`0d224977`, 2026-08-29) had the two mailbox words, the
  operation, Slop's call after every line, and `window.__dolly` with
  `submit`: the page ran its own proof on `?autorun=shell`. Tests never
  scraped the screen to know that a command had ended.
- Test logic has left the page once: `06369b4f` (2026-09-07) took 244 lines
  out ("there is no URL-triggered shell test runner. The harness drives
  normal image startup"). The handles stayed. Nobody has tried injecting
  them; `addInitScript` is used for the HTTP policy and a custom recipe
  only.
- The question has been written down four times and never decided:
  [audit 24](../20260930-100000-audit-24/TASK.md) (its step 2 of
  2026-10-06 is the reflection's step 1 in the same words; its step 3:
  "Either it is the embedding API, documented beside `DOLLY_HTTP_POLICY`
  and `DOLLY_HOST_MODULES`, or the tests inject it"), core polish, the
  round of 2026-10-05 and the robots task, where an agent at the deployed
  site found `__dolly` undocumented and read screenshots instead. No word
  of the owner on it was found.
- Today: defined on image pages only, once ready; 24 members with all nine
  modules that add one, 20 on `default`; members come and go with `nena`.
  Each one reads page state or does what a key, a click or a paste does;
  none gives an authority the user lacks. `saveSession(name)` saves without
  the click. Not reachable from Wasm; but any process may publish any
  status, which resolves a waiting `submit`.
- Counted: 63 test files use it; the status `submit` returns is asserted at
  227 of 244 calls, 54 of them for a failure. Outside tests:
  `scripts/accept-release.mjs`, `scripts/published-version.mjs` (against
  the deployed site, production pages) and the demo harness. No embedder,
  no image, no recording. About 128 lines of page JavaScript and 25 of C
  exist for it, and one line of Slop.
- What only this surface shows: a typed command's exit status without
  reading the screen; whether the foreground program is in raw mode; the
  terminal's text as text; the system snapshot's bytes; the broker's
  request count; GPU frames and adapter fallback; audio, microphone and
  button state.
- An injected module cannot reach the page's objects: they are bindings of
  the `src/browser.mjs` module. It needs the accessors kept, or a hook that
  is itself shipped. So step 1 moves about 85 lines and leaves the
  accessors.
- Without the two result words a test learns that a command ended from the
  screen (a selection gesture per poll; the failure rates on record are of
  that path: [terminal text](../20261001-095000-terminal-text-flake/TASK.md))
  or from a marker Slop prints, which users would see. Taking the operation
  out changes `process.h`, so the seed and every image.
- Not found out: the owner's view; any measurement of `submit` against a
  wait on the screen; whether injection without a shipped hook can work.

## What the reflection claims and proposes (2026-10-13, unchecked)

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
