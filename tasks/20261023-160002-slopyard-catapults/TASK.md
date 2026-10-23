# Slopyard: the slingshot catapults do not work as they should

- STATUS: OPEN
- PRIORITY: 170
- TAGS: game,combat,slopyard,0.1.4

Owner (2026-10-23): "create a task to fix the slingshot catapults in slopyard, search the
history in tatr theres a lot of user input there."

What the records say so far (the history goes further than this list; read it first):

- "The user likes the physical catapults" (`tasks/20260925-221800-codex-01`).
- "The user reports unstable slingers and frequent collisions with their loaders" and "The
  user intended a magnetic projectile fired by an existing slingshot" (task versions in git:
  `git log --all -p -i -G'slinger|projectile|catapult' -- tasks`).
- "Each of the eight slingshots should sit closer to the central combat zone"
  (`tasks/20260927-215800-codex-artillery-resupply`); "move every slingshot" among the
  "Additional user requirements" of `tasks/20260927-211000-codex-overnight-showcase`.
- Closed work on them: `tasks/20260925-205300-codex-01` (rescue traffic and a loaded
  slingshot), `tasks/20260926-044300-codex-01` (hits interrupt cargo flights), commits
  `fb2147e6` (aim before accelerating the arm), `4961bf0c` (snagged tether rounds).
- On today's catalog (`tasks/20261001-223000-slopyard-living-world`, lines 62-64 and 109):
  the Red roof sling and Blue Tengu hold a round and do not fire.

Done when: the owner's requirements from the history are listed here with their sources,
the slings and catapults load, aim and fire in the living world as he described, measured
with the audit (`audit.c`, `run.mjs` beside the living-world task) before and after, and
`demos/slopyard/test/slopyard-browser.mjs` passes on the GPU.
