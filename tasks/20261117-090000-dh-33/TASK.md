# Deep hedger, done: ready for 0.1.8

- STATUS: CLOSED
- PRIORITY: 130
- TAGS: dh,demo,release

The owner (2026-11-17): it ships in 0.1.8.

## Closed 2026-11-17

- The image is in the site's catalog (`config/domain-pages-images.txt`), so the menu lists it
  among the applications and `/deep-hedger/` opens it; `test/dollyfile-graph.test.mjs` passes.
- `demos/README.md` lists the demo; its README and THEORY.md are current with the model.
- The demos page has its section and a recording (`sites/slopshare.dev/agents/videos/deep-hedger.mp4`, 1:48, 3.2 MiB, with its poster; it plays in Chrome and in Firefox), made in real time from the image
  served by this tree in Chrome in kiosk mode, so no address shows
  (`work/dh-evidence/video/record.mjs`, this machine).
- The branch is from main (0.1.7, `b09b1e243`) and touches nothing of the core: `git diff --stat main...`
  names `demos/deep-hedger/`, `tasks/`, the demos page with its two media files, and one line
  each in `config/domain-pages-images.txt`, `config/upstreams.json`, `demos/README.md`,
  `demos/run-browser-tests.mjs` and `test/amy-browser.mjs` (the catalog's lists).
