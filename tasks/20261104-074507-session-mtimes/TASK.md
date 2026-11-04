# A session save keeps modification times

- STATUS: CLOSED
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

## Before (2026-11-04, `core/kernel-copies` images, Chromium and Firefox)

`build/http-evidence/probe-times.mjs` on `system`: two files set to 2000 and 2010 with `touch -t`,
a two-target make project with `a.in` edited after its build (`make -n`: `cp a.in a.out`), saved,
restored. After the restore every path had the restore's second, `old` and `newer` included, and
`make -n` said `Nothing to be done for 'all'`: the stale `a.out` was called up to date. The new
`test/session-times-browser.mjs` failed at its `stat` check (Chromium; the test stops there).

## The change

- A record is `kind:u32, path_bytes:u32, data_bytes:u64, modified:i64, path, data`: nanoseconds
  since the epoch (1677 to 2262; a time outside fails the save with EOVERFLOW, as a path the
  format cannot hold does), 0 for a deletion. `DOLLY_SESSION_VERSION` and the page's
  `DOLLY_SESSION_FORMAT_VERSION` are 3; a format-2 save is refused by its version, and its
  recovery by the page's check, as the decision says.
- The restore makes every path first, then sets each one's modification time
  (`dolly_session_restore_delta`, `src/session-records.h`), so a directory keeps its time with
  the paths made in it. Access times stay as the restore left them: a save does not hold them.
  WasmFS keeps times as milliseconds in a double, so what `stat` gives back is what was saved.
- A base path whose time changed is part of the save (`capture_filesystem` compares the time
  too): otherwise `touch` of a base file reverted at the restore, and make would miss the rebuild
  it asked for, the defect this task is about.
- `session-recover` restores the times into its copy: it reads the same records.
- Why the records looked as they did: `15440c6d7` (the first sessions) and `9c3ec573f` (format 2,
  recovery) chose a path and its data; nothing in the history weighed times, and the audit's
  proposal (`tasks/20261101-074306-audit-kernel`) found the make defect.

## The image's times

Measured after the change, before this part (`build/http-evidence/probe-base.mjs`, `system`,
Chromium and Firefox): an image's files had the time of the boot that restored them, so after a
restore every unchanged image file was newer than every saved one. A `cc -MD` project
(`hello: hello.c`, its depfile naming `/usr/include/stdio.h` and the libc++ headers) built,
saved and restored: `test /usr/include/stdio.h -nt hello` was true and `make -n` rebuilt
`hello`, where it had been up to date. Before the change the restore's time was later than the
boot's and nothing rebuilt (nor the stale target). So keeping a save's times alone made every
target that depends on an image file rebuild after each reload; in an image's own trees the
boot's times also followed the restore's path order.

An image holds no times, so the boot gives every path it keeps one, the same at every boot:
1980-01-02 UTC (`stamp_image_time` in `src/system-snapshot.c`, in the prune that already visits
each path after the restore). Older than anything a session makes, and a date ZIP can hold in
every timezone (Python's `zipfile` refuses anything before 1980 in local time; Nix's time 1 is the
known case). Kernel C, not an image input. Measured: the same project stays up to date after a
restore in both browsers; the snapshot end at boot (verification and prune, `system`, 2126 paths)
took 471-599 ms before and 476-545 ms after over five boots in each browser, no difference
beyond noise. `test/session-times-browser.mjs` makes its rule depend on `/usr/bin/make` too:
without the image time it fails at its make check (Chromium: `b.out` rebuilt as well).

## Closed 2026-11-04

On `core/session-mtimes`: `0cf7cb6dc` (format 3, a time per record), `5ac1c041a` (the image's
fixed time at boot), `e0fe324e7` (the seed's envelope comment, `docs/sessions.md`'s wording).
`test/session-times-browser.mjs` saves two files dated 2000 and 2010 and a make project edited
after its build, restores the session, and checks both times with `stat` and that `make` runs
exactly `cp a.in a.out`: before, it failed at its `stat` check in Chromium and Firefox; on the
final runtime (`sha256:1084cd14…`, image inputs `ff1bd22a…`, `default` and `system` rebuilt on
them) it passes in both, as do `session-offline`, `custom-session` (recovery included),
`snapshot-stream`, `pack-store`, `image`, `host-modules`, `nena` and `core`.
`test/session-recovery.test.mjs` checks the recovered copy's times natively (one before 1970) and
that a format-2 save is refused. `docs/sessions.md` lists modification times among what a save
holds; `docs/process-model.md` says what an image's times are.

The catalog round rebuilds every image: `src/fs-record.h` is a seed input. Without that comment
it would have been `system` and everything on it (`session-recover`'s sources changed).

## Lessons

- Keeping one layer's times exposed the layer under it. Faithful session times were older than
  the image's files after every reload, because the image had the boot's time: the first
  version, correct by its own test, turned a rare stale target into a rebuild of every target on
  an image header. Measure the consumer's invariant (make's order between image and session
  files) across both layers, not only the layer being changed.
- A throwaway `browserTest` in `build/http-evidence/` that prints the terminal (`probe-*.mjs`)
  gave each before and after in both browsers in under a minute, with the harness the real test
  uses; it found the image's times before any reasoning about them did.
- A comment in a seed header cost a 21-minute rebuild of `system` and `default` here (zig-build
  13 of it), and `system-build`'s snapshot came out byte-identical under a new identity: the
  catalog has no early cutoff, so a seed comment belongs with other seed changes, as tonight's
  round has them anyway. A change to `session-records.h` alone rebuilt `system` in 25 seconds.
- The checkout serves `src/` live, so a running browser test freezes the tree: the waits went to
  the task file and to reading the restore paths, edits only between runs.
