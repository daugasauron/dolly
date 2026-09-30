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
