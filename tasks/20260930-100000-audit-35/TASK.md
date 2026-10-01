# core-tools and install report wrong results or silent success

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: bug,commands,core

`modules/core-tools.dm`: `file` reports UTF-8 text as "data" (`:594`), `echo --` prints an empty
line (`:228`), `stat` prints `%a` as 0 and echoes unknown `%` formats (`:521-523`), `/bin/cd`
exits 0 with no effect (`:103-128`) so `command cd`, `xargs cd`, `find -exec cd` do nothing.
`install.c:183-188` ignores `-m/-o/-g/-p`.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Correct output or explicit failure.

## Done when

- Browser tests for each command's corrected behavior.

## Progress (2026-10-01)

- `file`, `echo --` and `stat %a` are fixed (`3c43dca`), covered by
  `test/commands.test.mjs`.
- `/bin/cd` is right as an external utility: it validates its argument and
  cannot change its caller's directory (as on Linux). The real bug was `command`:
  it was only an external program, so `command cd`, `command export` and
  `command -v cd` never reached Slop's built-ins. Slop now has a `command`
  built-in (`-v`, `-p`; functions skipped), checked by the Slop case "command
  runs built-ins in the shell and skips functions"; the external
  `/usr/bin/command` stays for `find -exec` and `env`. Browser verification
  comes with the next catalog rebuild.
- `install -m/-o/-g` stay accepted no-ops: the owner decided (2026-10-01) that
  permission operations remain no-ops in the one-user userspace.
- `install -p` now preserves the source's access and modification times with
  `futimens` (the kernel implements it); it was ignored on the claim that Dolly
  had no timestamps, but Make relies on them. `test/commands.test.mjs` checks it.
- The `command` built-in's Slop case passed in Chrome and Firefox on the rebuilt
  `rebuild-batch` catalog (2026-10-01), completing the browser verification.
