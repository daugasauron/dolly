# A session save keeps modification times

- STATUS: OPEN
- PRIORITY: 170
- TAGS: core,sessions,snapshots,filesystem

A save holds no timestamps (`docs/sessions.md:28`; a record of `session-records.h` is a path and
its data), so after a restore every file is as old as the restore and make compares the replay's
order, not the edits': a source edited after its last build can look older than its target, and
the stale target is called up to date (`tasks/20261101-074306-audit-kernel`, second proposal). With
tar restoring times (`tasks/20261104-074506-seed-commands`), make then sees upstream's times across
a reload too.

Decided 2026-11-04 (`tasks/20261102-133353-owner-decisions`): yes. A time per record (8 bytes), a
step of the record format's version. An older save is already refused by its runtime build
(`docs/sessions.md:40`), so no reader of the old format is kept.

Done when: a browser test saves two files with distinct modification times, restores the session
and reads them back with `stat` (fails before), in Chromium and Firefox; a small make project
saved after an edit rebuilds exactly the edited target after restore; `docs/sessions.md` lists
timestamps among what a save holds.
