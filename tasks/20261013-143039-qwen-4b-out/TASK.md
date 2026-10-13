# The four-part Qwen model leaves the catalog

- STATUS: CLOSED
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

## The limit, so that it can come back as one package (read at `11d2bd0a`, not changed)

- One number in two places: `MAX_SNAPSHOT_BYTES` (`src/snapshot-records.mjs`,
  the page and the build scripts) and `DOLLY_SNAPSHOT_MAX_SIZE`
  (`src/fs-record.h`, the kernel and `src/dollyfile.c`, so the seed). It
  bounds an image, a pack and one file's record.
- No reason is written beside either. The code's reason is one buffer on both
  sides: the kernel captures an image into one `malloc` (`capture_snapshot`)
  and restores a staged one from one `realloc`; the page copies the capture
  into one `Uint8Array`, and merges a published image's packs into one buffer
  for a build input and for `amy install` (`loadPackagedSystemSnapshot`,
  `PackageService.fetch`).
- The way in already goes record by record: booting a published image
  (`dolly_snapshot_stream_*`), and `amy` and `dollyfile` reading an artifact
  file. What is missing is the same on the way out and for inputs: a capture
  that leaves the kernel pack by pack, packs handed on unmerged, and a file's
  record that may span them. Then 3.01 GB is one package holding one file.
- Not measured: whether Chrome and Firefox give one buffer above 2 GiB, which
  would make it a change of the number alone.

## Done on `core/qwen-4b-out` (2026-10-13), not built

`21cc75b4`: the model is out.

- Deleted: the five recipes, `models/qwen3.5-4b.json`, its rows in
  `config/upstreams.json`, `docs/licences.md`,
  `config/domain-pages-images.txt` (five) and `test/amy-browser.mjs` (two
  lines), the README's rows, table row and sentences. It had no pins in
  `config/source-pins.sh`: a model's pin is its description's `source`.
- What reaches `/local`: `demos/local-llm/models/` is packed into
  `provider.tar` as `/usr/share/dolly/llm`, and the provider lists that
  directory. The archive now holds two descriptions (listed with `tar -t`),
  and `models.test.mjs` fails a description whose package has no recipe.
- Decided: what only this model reached goes with it, since nothing left
  can run it. `build-gguf-split.sh` and the split branch of
  `prepare-local-llm-weights.mjs`; and `unmet()` in `model.mjs`, the refusal
  for a description that omits a shader kind, with its three callers.
  `models.test.mjs` requires both kinds instead. A model that fits only with
  16-bit floats brings `unmet()` back from this commit's parent.
- Kept: `packages` and `files` stay lists in a description, so the two model
  packages are not repinned.
- Measured: the edited staging script, run on the cached weights of
  `work/rust`, wrote the eight files of `qwen3.5-2b` and `minicpm5-2b` with
  the hashes their recipes pin. `build-source-tar.mjs` reproduced
  `provider.tar`'s old pin from the parent, so the new pin
  (`817376e8…`) is what staging will write.
- The GPU test (`local-llm-browser.mjs`) proved with a second model: `/local`
  lists a model the image does not bundle as not installed, choosing it asks
  for and runs `amy install`, Pi switches to it, its temperature and context
  size change through `/local`, a context too large is refused, the task is
  done again with it and its rate shows, `amy installed` lists its package,
  and nothing left the site. All of that stays, with `minicpm5-2b` on every
  adapter. Lost: an install of several packages in a row, which no model
  needs now.

`86686e1f`: `docs/dollyfile.md` says `qwen3.5-2b` in its two examples. An
image input: `Dollyfile-dolly-docs` and `studio.tar` (old pin reproduced
first) are repinned.

Source suite with the demos' tests: 429 of 429 after each commit. The plan
over all 128 images rebuilds four and reuses the rest: `dolly-docs`,
`pi-agent`, `pi-local`, `dollyfile-studio`. No seed change.

Left, for the tree that can build them; the task closes after it:

- Build those four.
- `npm run test:demos -- local-llm` headless (both start screens open
  `/local` through the edited provider), then with a GPU window in Chrome
  and Firefox. New there: where the adapter has `shader-f16` the second
  model is `minicpm5-2b`, a path the test took only with f32 before.
- `npm run test:demos -- studio` and `-- pi`; `test/amy-browser.mjs` (its
  catalog check lost five names) and `test/docs-browser.mjs`.

## Closed 2026-10-14

Built and tested on `main` `f51cc4be` in the night of 2026-10-14, with the
other pieces of the evening
(`work/evidence-2026-10-14/integration/status.log`):

- `pi-local` and `dollyfile-studio` rebuilt among 21 images (618 s).
- The local models' GPU test on a private display, both browsers, both
  images: "task with qwen3.5-2b, minicpm5-2b installed and chosen with
  /local, temperature and context size changed, task again: passed with
  external requests denied".
- Core suite passed in both browsers (407 s), `amy` among it without the
  two lines; 27 demo suites passed, 6 skipped for want of a GPU window,
  none failed; 25 artifact tests.
- `git grep qwen3.5-4b` outside `tasks/` finds nothing: the last one was a
  valid-name case in `test/fixtures/dollyfile-syntax.mjs`, now
  `qwen3.5-2b`.

The limit and what would lift it stay above, for
[the direction](../20261013-142800-direction/TASK.md).

