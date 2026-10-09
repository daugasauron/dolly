# Sort everything on the Dolly page alphabetically

- STATUS: OPEN
- PRIORITY: 150
- TAGS: page,catalog

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
