# Deep hedger, for the owner: historical returns

- STATUS: OPEN
- PRIORITY: 40
- TAGS: dh,owner

Conflict 2 of `demos/deep-hedger/THEORY.md` (section 5; decision 1), the thesis conflict
`~/dev/mano` flags. The owner's words on each side:

- **None.** "initially I don't want to use any historical returns and conciously overfit"
  (boom, 2026-07-22); "I have been actively against using historical stock returns as input to
  the model. I am trying to create a model that only take todays option prices as input since
  they are forward looking by definition." (mano, 2026-09-07).
- **A short window.** "that is fine to use the actual historical returns with a short history.
  It's not the full history it's just something to make volatility clustering actually
  learnable." (braut, 2026-07-25).
- **Later, as properties.** "I think I'd like to express everything that comes from historical
  paths as parametric properties (vol clustering), not add the returns directly." (braut,
  2026-07-25).

## State 2026-11-17

The demo takes the latest word: no historical return enters it anywhere. `braut/mojo`, the
newest earlier code, still reads observed returns (`gpu_generator.mojo:104-139`). For the owner
to confirm; it matters again with a law that has memory (task dh-17).
