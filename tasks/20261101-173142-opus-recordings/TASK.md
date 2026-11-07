# What tonight's Opus 5.5 recordings found in Dolly that is still open

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: demo,studio,rust,recordings

Owner (2026-11-01): "I want you to use the API token in ~/.claude and create some cool demo
videos. I want opus5.5 playing minecraft, bunnyhopping, creating something in dolly studio (a
few different projects)". Ten videos were made (`work/videos-2026-11-01/cuts/README.md`); the
takes found the following in Dolly. Fixed during the night, on `integrate/2026-11-02`:
`7d8b1d47` (game agents' context kept the provider's prompt cache), `b5061272` (ClassiCube's
look spread over frames), `5effe0d3` (display shows frames opaque), `c2a7b8b8` (Studio's
examples declare `threads@0`). Proposed: `proposal/http-body-limit` (64 MiB requests).

Still open, each measured once (evidence under `work/videos-2026-11-01/`):

- **Rust has no `test` crate.** In Studio, `#[test]` functions in a Cargo project do not
  compile; Opus wrote a `harness = false` runner (`studio/s8b-garden/assistant.txt`). Done when
  `cargo test` runs ordinary `#[test]` functions in Dolly.
- **A Rust image that keeps cargo exited at once when opened from Studio**
  (`studio/s8b-garden`): the build succeeded (4,827 paths, the 370 MB toolchain inside) and its
  self-test ran during the build. Not reproduced or explained yet.
- **Studio building a Rust or Go image passes 6 GB in one tab** (the Rust take was OOM-killed
  with Chrome at 5.1 GB anonymous; with 9 GB both built). Same cause as
  `tasks/20261101-074223-audit-runtime` finding 21 (capture holds the image about three times).
- **bhop: Opus 5.5 never cleared pad 3 of 32** in two takes (75 min, 26.86 USD): from pad 2 its
  jumps fall short of pad 3's top. Not a Dolly defect as far as measured; the course may need a
  first section a model can learn from screenshots, which is a game-design question.

- **http@0's 10-minute deadline cuts a streamed model response** (`studio/s11-chess`, 2026-11-02
  07:07): Opus 5.5 at high effort streamed a 910-line C file in one response; at 600 s the broker
  ended the request ("Browser HTTP deadline exceeded") and Pi stopped. The deadline
  (`timeoutMilliseconds`, 600,000 by default) bounds a whole request, and a streamed response may
  rightly last longer (128K output tokens). A hang is a silence, so the bound that protects the
  page is one on time without bytes, not on total time; the same lesson as the 8 MiB body limit
  (`proposal/http-body-limit`): a local limit below the remote one turns success into an error.
  A contract change: for the owner, with the body limit.

Done when each item is fixed with its evidence or closed with its reason.

## Closed (2026-11-07)

This record sat on `core/release-fixes` (`dd2d78e8a`, `2a2f4f988`), never merged; brought in with
0.1.6. Each item:

- Rust's `test` crate: fixed in v0.1.5, whose notes say `cargo test` runs a crate's tests and,
  with the `rustdoc` the `rust` package holds, a library's doc tests.
- The Rust image that exited at once: `tasks/20261102-023648-video-findings`, still open there.
- Studio over 6 GB for a Rust or Go image: the cause named, the capture holding the image three
  times, is gone (`tasks/20261101-221415-stream-capture`, closed 2026-11-03); not measured again
  for Studio.
- bhop's pad 3: not a Dolly defect; the third take (`cuts/bhop.mp4`, on the v0.1.5 demos page)
  chains hops at 314 units/s and still misses pad 3, by its own diagnosis its velocity lagging its
  view: a question of the course's design.
- http@0's deadline: fixed in v0.1.5, whose notes say the policy's timeout bounds each wait, not
  the whole transfer, with request bodies of 64 MiB.
