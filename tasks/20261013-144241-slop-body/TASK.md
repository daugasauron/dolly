# SLOP takes a body, and RUN goes

- STATUS: OPEN
- PRIORITY: 250
- TAGS: core,dollyfile

Owner (2026-10-13): "I want to get the core right, Dollyfile syntax, host
modules/bridge, browser runtime etc. It should be as clean and small as
possible in order to be extensible. Think unix philosophy (this is a core
thing)." One issue of
[the reflection on the direction](../20261013-142800-direction/TASK.md)
([reflection](../20261013-142800-direction/reflection.md), section 3).

Done when: a `SLOP` row may be followed by an indented body, run as one
script; no recipe writes a script with `FILE` to run it in the next row;
`RUN` is gone.

## As filed (2026-10-13, main `e330d782`)

- `SLOP` is one line: 25 rows run a script that a `FILE` row wrote, and 9%
  of all recipe text is line continuations. `FILE` has the lexer a body
  needs (`src/dollyfile.c:1687-1700`).
- `RUN`: 5 rows, all in `Dollyfile-system-build:88-112`, to compile Slop
  before Slop exists; `bootstrap.c` already compiles `/bin/dollyfile` first
  and could compile Slop too.
- Engine in the seed and the recipes that use it.
