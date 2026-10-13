# Two roles in the Dollyfile: an image and a package

- STATUS: OPEN
- PRIORITY: 240
- TAGS: core,dollyfile,owner

Owner (2026-10-13): "I want to get the core right, Dollyfile syntax, host
modules/bridge, browser runtime etc. It should be as clean and small as
possible in order to be extensible. Think unix philosophy (this is a core
thing)." One issue of
[the reflection on the direction](../20261013-142800-direction/TASK.md)
([reflection](../20261013-142800-direction/reflection.md), section 3).

Done when: a recipe is an image or a package; whether an image opens is a
property (it has an `ENTRY`), not a third noun; engine, reader, lint,
document and recipes say so.

## As filed (2026-10-13, main `e330d782`)

- The engine tells `APPLICATION` from `TOOLCHAIN` by one check, "missing
  ENTRY" (`src/dollyfile.c:1810`); 32 of 34 toolchains have an `ENTRY` and
  open; both can be a `FROM` base. The split that matters is at 1401: a
  package keeps nothing of what it is built on.
- The lint's "an APPLICATION needs display@0"
  (`scripts/lint-dollyfiles.mjs:68`) names a module where "has an ENTRY"
  says it.
- A change to the language: the owner's to confirm.
