# amy: describe each package and show what an install adds

- STATUS: OPEN
- PRIORITY: 245
- TAGS: packages,amy,agent-experience

## Remaining (2026-10-07)

In the candidate (`work/amy-index`, through `9d9064b3`): `amy list` with
descriptions, `amy info NAME`, the install summary, `amy files NAME`, every
package described and linted; `test/amy-browser.mjs` passed in Chromium and
Firefox in the main round, its `amy programs` block installing `ripgrep`
among others (`work/next/build/next-evidence/finish-amy-*.log`). Left:

- `amy info` printing the download size, the host modules and the exports;
  the install summary naming variables (`python` is the case).
- A model package (`qwen3.5-2b`) through the test's `info`, summary and
  `files` checks: the model packages exist only in the catalog round.
- `docs/dollyfile.md` ("Packages and amy") read once more against what
  exists.

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

## Decisions and state (2026-10-06, `work/amy-index`)

Decided:

- The description is the README line (`` - `NAME`: … ``), carried by the
  index (`20261005-223931-public-package-index`), not a recipe directive.
  It is the one sentence each image already has and the start page shows, so
  nothing is written twice. A directive would put prose under the pin: a
  recipe's SHA-256 is the image's identity, so correcting a sentence would
  re-pin and rebuild everything that depends on the image. It is explicit:
  `npm run lint:dollyfiles` and the source suite fail an image without one,
  by name.
- What an install adds comes from the snapshot `amy` installs, not from the
  engine: `/bin/dollyfile` is seed content and its record would be a seed
  change. `amy` reads the snapshot's records (path and size) after the
  engine has accepted it.

Done, in `default`, Chrome and Firefox (`test/amy-browser.mjs`):

- `amy list`: name, `installed` or `-`, description.
- `amy info NAME`: description, the `INSTALL URL SHA256` row, installed or
  not.
- `amy install NAME` ends with what it added, for `python`:
  `amy: python installed: 1551 files, 46832411 bytes, commands: pip pip3
  python python3; amy files python lists them`.
- `amy files NAME`: `SIZE PATH` per file or link outside `/etc/dolly`, from
  the record the install kept (`/etc/dolly/files/NAME`, no network), or for
  a package no session installed (the image's `zlib`) from the release's
  snapshot. The test compares every listed size with the file.
- All 22 packages have a description.

Model packages need no second mechanism for these two things: a model's row
in the index is its description, and after `amy install` its weights are
lines of `/etc/dolly/files/NAME` with their sizes. What the model
description of `20261005-215557-local-models` (`/usr/share/dolly/llm/ID.json`)
shares with this: the package names, one sentence per package and the files
with sizes. What stays its own: GPU memory, the Pi model definition, the
weights' source and licence, and sizes before install (the index has none).

Left, so the task stays open:

- `amy info` does not print the download size, host modules or exports, and
  the install summary does not name variables. The recipe has the last three
  (`REQUIRES HOST`, `EXPORTS` lines; `amy info` could print them from the
  recipe URL, which every page serves as a bootstrap source); the size is
  only in the snapshot metadata.
- Not run here: a model (`qwen3.5-2b`) and `ripgrep` by name; their
  packages were not built on this tree. The `amy programs` block installs
  `ripgrep` with `codex-cli` in the catalog round.
