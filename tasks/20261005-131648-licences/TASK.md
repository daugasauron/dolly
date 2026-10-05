# Licences and upstream sources: a page on the site and an audit

- STATUS: OPEN
- PRIORITY: 270
- TAGS: site,licences,audit

Owner (2026-10-05): "I want a link directly on the page highlighting the
licences and gitrepos that this project demos build on, and an audit of the
licences currently used by this project and the implications."

## Work

1. Inventory every upstream the catalog builds or bundles: recipe `SOURCE`
   lines, `docs/sources.md`, the toolchain seed, fonts, models and game data.
   For each: repository, pinned version, SPDX licence, and whether the sites
   distribute its source, a binary, or both.
2. A page generated from that inventory, served on both sites and linked from
   the front page. A hand-written list rots.
3. Audit: obligations per licence family for what is actually distributed
   (source offers for GPL binaries, notices, model and data licences), what is
   linked together into one binary, Dolly's own licence and whether the
   repository states it, and the concrete gaps with their fixes. Not legal
   advice; mark what needs the owner's decision.

The same agent takes `20261005-131527-robots-txt`.

## Done when

- The front page links a page listing every upstream with repository and licence.
- The audit and its gaps are recorded in `docs/` or here.
- A test fails when a recipe source has no inventory entry.
