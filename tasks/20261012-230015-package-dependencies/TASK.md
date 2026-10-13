# A package names its dependencies: amy installs the INSTALL rows of its recipe

- STATUS: OPEN
- PRIORITY: 330
- TAGS: packages,amy,core

Owner (2026-10-13): "Reflect on how the package dependencies could work with
amy, I guess it could work out of the box by just parsing the Dollyfiles?
They already specify requires etc? No need for new syntax to manage it?"

Done when: the answer is here with what was measured, and either a package's
snapshot holds its own files while `amy install` installs the `INSTALL` rows
of its recipe first (tested in both browsers, sizes before and after), or
the task says exactly what stops it.

## As filed

- Today `INSTALL` inside a package copies the installed files into the
  package's own snapshot: `cargo` is 500 MB of which 463 MB is `rust`, and
  Qwen3.5-4B is four shard packages because one snapshot holds 2 GiB
  ([packages](../20261012-130814-packages/TASK.md), item 3 of "Held").
- The recipe already names what a package needs: `INSTALL` rows with pins,
  `REQUIRES TOOL|LIB|HEADER`, `REQUIRES HOST`. A package keeps its recipe in
  `/etc/dolly/Dollyfile`. The question is whether resolving those rows at
  install time is enough, with no new syntax.
- It changes `src/dollyfile.c` and `src/commands/amy.c`: the seed.
