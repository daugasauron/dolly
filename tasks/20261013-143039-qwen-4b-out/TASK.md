# The four-part Qwen model leaves the catalog

- STATUS: OPEN
- PRIORITY: 220
- TAGS: packages,local-llm,owner

Owner (2026-10-13): "I don't want this 4 part qwen model listed as a package,
either find some nicer way to do it or just remove it. It's ugly."

Done when: no recipe, list, test or page names `qwen3.5-4b` or its four
shards; `pi-local` offers the two models that are one package each and its
tests pass with them; the reason a model of that size cannot be one package
is written where the limit is, so that it can come back as one.

## As filed (2026-10-13, main `d89bca74`)

- Qwen3.5-4B is 3.01 GB and an image's snapshot is one buffer of at most
  2 GiB (`MAX_SNAPSHOT_BYTES`), so the model is four packages,
  `qwen3.5-4b-1` to `-4`, and since the round of 2026-10-13 a fifth,
  `qwen3.5-4b`, that installs the four by reference. `amy list` and the
  start page show all five.
- The integrator's decision: remove it. A nicer way inside today's rules
  would need a kind of package that is installed but not listed, a new
  notion in the catalog for one model. The real fix is in the core: a
  snapshot larger than one buffer. That is a question for
  [the direction](../20261013-142800-direction/TASK.md), not a recipe trick,
  and the model returns as one package when it is answered.
- What names it: five recipes in `demos/local-llm/`, `models/qwen3.5-4b.json`,
  the README's rows and its table, the second model of the local-llm GPU
  test where the adapter has 16-bit floats, five rows of
  `config/domain-pages-images.txt`, a row of `config/upstreams.json` and of
  `docs/licences.md`, its source pins and the split in the demo's staging,
  two lines of `test/amy-browser.mjs`, and `docs/dollyfile.md`, which uses
  the name twice as an example of a name with a dot.
- What is lost: the README's measurement that the 4B model fits only with
  16-bit floats (49 tokens a second against 5); it stays in
  `tasks/20261005-215557-local-models`.
- Rebuilds: `pi-local` and `dollyfile-studio`, and the docs package with the
  Pi images for the two words in `docs/dollyfile.md`.
