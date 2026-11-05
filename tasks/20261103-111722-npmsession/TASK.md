# npm: a page of one's own saves sessions and opens them again

- STATUS: CLOSED
- PRIORITY: 380
- TAGS: npm,sessions,snapshots

Owner (2026-11-03): "Another thing regardiung the npm package, I noticed when I tried it that the
"save/session" thing iddn't work. That is very important."

Why it did not (found 2026-11-02 by the second stranger, `tasks/20261102-133357-npm-agent-sandbox`):
a page of one's own could save (`REQUIRES HOST snapshot@0` puts the Save button on it), but nothing
could open a save again: snapshot@0 took the name only from the site's `/session/?name=` route,
which `boot()` had no option for, so `dolly-build init` left snapshot@0 out of the template.

Done (2026-11-03, branch `npm/sessions`):
- `boot({ session: NAME })` opens a save as it was, through snapshot@0's own `boot(route)`, and
  writes no `files` over it (the page's files are a fresh start's). Without snapshot@0 among the
  page's modules it says so.
- A save on a page without a `site` names itself in the tab's address as `?session=NAME`, as the
  site's saves name their session route; the errors' "Open /sessions" is the site's alone.
- `dolly-build init` declares snapshot@0 and its page passes the address's `session` to `boot()`.
- `docs/embedding.md` (the `session` option) and `README.md` (Save in "Pi with npm").
- `test/npm-browser.mjs`: in the npm-made project, an edit to `/workspace/README.md`, then
  `saveSession("kept")`; the address holds `?session=kept`; reloading it boots the save and the
  edit is there. Passed in Chromium (47.1 s) and Firefox (53.5 s), packages packed from this tree.

Left: the done-when of `tasks/20261103-111707-cache` (a reopened session still fetches its image's
packs), and the next catalog round's `dolly-docs` (the two documents changed).

## Closed (2026-11-04)

Both leftovers are done: `tasks/20261103-111707-cache` is closed, and `dolly-docs` was rebuilt with the two documents. Evidence: today's confirming round on `integrate/2026-11-03` at `ebffaaad8` (`work/round-1104-main.sh`, evidence `work/integrate/build/round-1104b-evidence/`), now `main`: source 470/470, artifacts 26/26, every browser test, npm packages in Chromium and Firefox, 36 demos and the GPU stage passed; `test/npm-browser.mjs`'s save-and-reload passed in both browsers.
