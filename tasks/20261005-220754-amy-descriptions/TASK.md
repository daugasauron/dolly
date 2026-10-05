# amy: describe each package and show what an install adds

- STATUS: OPEN
- PRIORITY: 245
- TAGS: packages,amy,agent-experience

Owner request (2026-10-06): "in amy I want to get some description on what
files are created when installing a package, and add some description/help
text to each package."

## Today (main `4f8a2309`)

- `amy list` prints names only. The index `dist/dolly-packages.txt` is
  `NAME URL SHA256` per line; nothing says what a package is.
- `amy install NAME` prints the engine's `INSTALL URL (15 paths)` and
  `NAME installed; its environment applies when the session is next loaded`:
  a count, not the files, commands or variables it added.
- `/etc/dolly/installed` records the executed rows; nothing records which
  paths each install wrote, so nothing can list them later.
- Every image already has a one-line description: the `- \`name\`: …` line in
  its README, which `scripts/image-menu.mjs` requires and the start page shows.

## Expected

- Description: one source per package, shown by `amy list` (name and one
  line) and a new `amy info NAME` (description, download size, host modules it
  needs, commands and variables it exports), before installing. Recommended
  source: the existing README line, carried in the index, so the start page
  and amy cannot disagree; a description directive in the recipe is the
  alternative and is a Dollyfile language decision for the owner.
- What an install adds: `amy install` ends with a short summary from the
  package's own receipt (commands now on `PATH`, variables set, number of
  files and bytes), and `amy files NAME` lists every path an installed
  package wrote. The engine already reads the artifact's manifest and exports;
  record the paths per row instead of recomputing.
- Longer help travels as man pages inside the package
  (`20261005-220754-man-help`).

## Done when

- `amy list`, `amy info NAME`, the install summary and `amy files NAME` work
  in `default` in Chrome and Firefox (extend `test/amy-browser.mjs`), for a
  command package (`ripgrep`), one with variables (`python`) and a model
  (`qwen3.5-2b`).
- Every package in the catalog has a description; lint fails one without.
- `docs/dollyfile.md` ("Packages and amy") says only what exists.

This changes the seed (`/bin/amy`, the engine's install record): batch it with
the next rebuild round.
