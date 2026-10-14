# python does not install ninja: what NumPy's build needs is the session's to install

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: packages,amy,owner

Owner (2026-10-13): "python shouldn't require ninja. Thats a numpy dependency
which has nothing to do with python itself, its a 3rd party thing. It hsould
be possible to solve it by manually installing ninja in order to pip install
numpy, create a task for this"

Done when: `amy install python` brings no `ninja`; in a `default` session
`amy install python ninja`, then `pip install numpy`, builds NumPy, tested in
Chromium and Firefox; the README, the index and the Python demo's test say
that and nothing else.

## Done (2026-10-14)

`python` installs `cc` and no longer `ninja` (`5b7c6ca5`); its README says
what NumPy's build needs is the session's: `amy install python ninja`. The
Python demo's test installs `python` on `default`, finds no `ninja`, installs
it and builds NumPy: passed in Chromium and Firefox before the round, on
today's seed (`DOLLY_BUILD_IMAGES=python,…`, 141 and 168 s), and in it.

In the round of 2026-10-14 (`integrate/round-1014`, evidence in
`work/rust/build/round-1014-evidence/`), which passed: every image built,
source tests 430/0, artifact tests 25/0, the core suite in both browsers in
419 s, the demo suites (26 passed; `rts` failed with its known early-input
stall and passed alone after), the five GPU checks.

## As filed (2026-10-13, main `67a77d3b`)

- The round of 2026-10-13 made `python` install `cc` and `ninja`
  (`demos/python/Dollyfile-python`, from the commit held the night before),
  so that `amy install python` alone builds NumPy. The owner's rule is the
  other way: a package brings what is its own, and what a third party's
  build wants (Meson's Ninja, for NumPy) the session installs.
- To take out: the `INSTALL` row of `ninja`. `cc` stays unless the owner says
  otherwise: pip has no wheel to fetch for Dolly, so it compiles every
  native package, NumPy or not, and `cc` is by reference and adds nothing to
  `python`'s snapshot. Taking it out too is the same one row.
- What it costs: `python` is installed as a build tool by `rust-llvm`,
  `llvm-tablegen`, `zero-ad-spidermonkey` and `mojo-llvm`, and `meson`
  installs it, so a change to its recipe repins and rebuilds the Rust, LLVM,
  Mojo, Pi, Codex and 0 A.D. chains: hours, not minutes. It rides
  [the next catalog round](../20261012-220109-next-round/TASK.md).
- Until then `amy install python` brings Ninja along; nothing is broken by it.
