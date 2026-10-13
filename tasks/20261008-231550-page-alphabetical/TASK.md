# Sort everything on the Dolly page alphabetically

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: page,catalog

## Closed (2026-10-13, `8a7561d8` and the commit of this text)

One comparison, `alphabetical` in `src/alphabetical.mjs` (by name, ignoring case; names equal but
for case keep one order), sorts each list where it is produced:

| List | Produced by | Before |
| --- | --- | --- |
| The menu's groups (Applications, Packages, Toolchains) and the images in each | `scripts/generate-routes.mjs` through `menuGroup` and `menuBody` of `scripts/image-menu.mjs` | by role, then the recipe's directory, then name; `default` first |
| "Hosted on slopshare.dev", the group GitHub Pages adds | `scripts/package-github-pages.mjs`, which puts it among the groups by its heading | appended last, in the catalog file's order |
| The package index `amy-index.txt`, which `amy list` prints | `scripts/generate-routes.mjs` | the registry's order |
| The licences page's projects, and the images that build each | `scripts/upstreams.mjs` | the order of `config/upstreams.json` and of discovery |
| Saved sessions | `listStoredSessions` in `src/session-store.mjs` | newest first |

Four lists are written by hand: in `menu.html` the row of pages under "Images" and the
shortcuts, in `llms.txt` its pages and its files. They are in order now, and the test fails when
an entry is put out of it. `default` is no longer the first row, so the page's first sentence
links it and `llms.txt` says to start there. Not sorted, because their order is what they say:
a recipe's lines and a build's log. No page lists versions: the root leads to the newest.

`test/site-browser.mjs` reads the order from the DOM (the groups, each group's images, the
pages row, the shortcuts, the licences table and its "Built by" cells), from the package index
and from `llms.txt`, and
saves two sessions, `versioned` and then `Zeta`, which the sessions page must list in that
order: by time or by code unit `Zeta` would be first. Passed in Chromium (Chrome 151) and
Firefox 155 on 2026-10-13. A new image, package, upstream or session lands in order by the
sort; a new shortcut by the test.

Seen on the way and fixed in the same commit: nine menu descriptions ended in the middle of a
sentence (`mojo`, `wine`, `xonotic` and six build images), because the README item they come
from wraps over lines and only its first line was read. An item is now read to its end.

Left for whoever edits it next (`docs/dollyfile.md` was another agent's file that day): its
sentence "the start page lists images by role, toolchains grouped by their directory" should
read "by role, each group by name".

## The request

Owner (2026-10-08): "add a task that I everything on the dolly page to be
sorted alphabetically".

Read as (integrator's interpretation): every list a visitor sees on the
site's pages is in alphabetical order by its visible name, wherever the list
comes from: the catalog of images and demos, packages, host modules, tools,
documents, saved sessions and versions. Lists whose order carries meaning
(build steps, a recipe's lines, a log) are not lists of this kind.

## Done when

- Each such list is sorted by one shared comparison, case-insensitive, at the
  place it is produced rather than in each page.
- A browser test opens the pages and reads the order from the DOM.
- A new entry lands in order without anyone placing it by hand.
