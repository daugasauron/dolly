# Bonnie package installer checks and markers

- STATUS: OPEN
- PRIORITY: 170
- TAGS: bug,demo,python

Bonnie's name-mismatch check compares the request with itself
(`src/runtimes/bonnie.py:175,249`); environment markers are never evaluated (`:129-160`). pip is
used only for `packaging` and `pip wheel`; `pip install --no-index --find-links` could replace
Bonnie's install step.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Correct distribution-name validation and marker evaluation, or delegation to pip.

## Done when

- Python image test installs a package with markers and rejects a mismatched distribution.

## Progress (2026-10-01)

Bonnie checks the PyPI name and evaluates markers (`313783d`);
`demos/python/test/recipes.test.mjs` covers it under host Python. Missing: the
Python image test from "Done when".
