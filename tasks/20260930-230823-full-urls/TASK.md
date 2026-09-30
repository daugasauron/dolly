# Replace HOST with full URLs for every Dollyfile resource

- STATUS: OPEN
- PRIORITY: 250
- TAGS: dollyfile,design,syntax

Owner request (2026-10-01): remove the `HOST` keyword; every resource a recipe
names is a full URL, host included.

## Today (docs/dollyfile.md)

- `FROM HOST /Dollyfile-name SHA`, `COPY FROM HOST /Dollyfile-name SHA SRC DST`,
  `USE HOST /modules/name.dm SHA` and `SOURCE HOST /path DST SHA` name paths on
  the site that serves the page. The page grants them to builds under the
  hardened bootstrap quota.
- `SOURCE URL https://… DST SHA` names an external file; it passes only if the
  page's HTTP policy allows it.
- `REQUIRES HOST name@abi` uses the same word for something else: a browser
  host module.
- Tools key recipes by site path: `scripts/recipe-files.mjs`,
  `src/dollyfile-graph.mjs`, `scripts/update-module-pins.mjs`,
  `scripts/lint-dollyfiles.mjs`, the Dollyfile view pages, and the executor
  `src/dollyfile.c`.

## Questions to settle first

- Which origin catalog recipes name, and how local builds, test servers on
  random ports and a fresh clone before publishing fetch those URLs: serve the
  named origin locally, or map it to a mirror at the broker.
- Identity must not depend on where bytes were fetched: pins stay SHA-256 over
  content, and a mirror must yield the same image identity.
- Policy: with full URLs the page must grant the content origin explicitly.
  This fits the open "pinned-only network for builds" decision: a build may
  fetch exactly its pinned URLs.
- The new name for `REQUIRES HOST name@abi`, which is not a resource.
- Whether the syntax change is `DOLLY 5`, and how existing pins migrate.

## Done when

- No recipe or tool uses `HOST`; every `FROM`, `COPY FROM`, `USE` and `SOURCE`
  names a full URL; `docs/dollyfile.md` describes it.
- The catalog built from the local server and from the published site gives the
  same image identities; pin, lint, graph and view tools handle full URLs.

## Proposal (Fable review, 2026-10-01)

- Syntax, with the digest right after every URL (today `SOURCE` is
  `location DEST SHA` but `USE` is `location SHA`):
  `FROM https://daugasauron.com/Dollyfile-system SHA`,
  `COPY FROM https://…/Dollyfile-codex-build SHA SRC DST`,
  `USE https://…/modules/search-tools.dm SHA`,
  `SOURCE https://…/static/codex/sources-00.part SHA DST`.
- Identity: recipes name one canonical published origin; identity stays the
  hash of recipe text plus SHA-256 pins, so a mirror changes nothing. The
  embedding maps the canonical origin to a mirror in the build policy, which is
  already trusted browser state: `npm run serve` maps it to localhost, a fresh
  clone serves unpublished files under the same mapping. The build policy
  becomes exactly the graph's pinned URLs (`20260930-232236-rebuild-network`).
  `join_host_url` and the `HOST-BASE` argument in `src/dollyfile.c` go away.
- Keep `REQUIRES HOST name@abi`: once resources drop `HOST`, the word means
  only browser host modules, matching `host/` and `DOLLY_HOST_REQUIRE`.
