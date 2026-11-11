# A saved session: the whole filesystem, a restore that downloads nothing, Pi's conversations

- STATUS: OPEN
- PRIORITY: 365
- TAGS: sessions,npm,pi,0.1.6

The owner, 2026-11-11 10:00 JST, from using the npm packages:

> It seems there are problems with session save. I was under the impression that the whole
> runtime would get persisted in local storage at save? I still see the "download runtime" etc
> when restoring a saved session. Also, it seems some files are not present after restoring a
> save, for example pi session files (~/.pi/agent/sessions). I want the whole file system to be
> stored in a saved session.

## State (2026-11-11)

Done on `fix/session-whole`, tested on images before the 0.1.6 bump:

- A save is the whole filesystem but `/dev`, `/proc` and `/run` (format 4, at most 8 GiB and
  1,000,000 paths): the kernel lists every path and streams it through the snapshot mailbox
  file by file (`host/snapshot/kernel.c`); a file that changes meanwhile fails the save, naming
  it. The page keeps it as a Blob of its parts.
- A restore boots from the save alone: the Workers ask the host modules first
  (`restoreFilesystem`), the snapshot module empties the filesystem and streams the decompressed
  save into the kernel, and no image is loaded. `test/custom-session-browser.mjs` asserts no pack
  request and no image load on a restore, and that a save holds more than the image.
- A save opens on the runtime that made it whatever became of its image's recipe (a project
  built again); a custom one needs no cached image, its Dollyfile checked against the recipe
  digest it was built from. The rebuilt-base checks went with the baseline.
- Measured before the change, on the site's `system` route (Chrome): files under
  `~/.pi/agent/sessions` and `/workspace` came back after a restore; the baseline was taken
  before a save was replayed.

Passed: session-offline, session-times, custom-session, host-modules, pack-store, indicators
(Chrome, Firefox), the session unit tests. Left: the owner's flow on the 0.1.6 round's images
(Pi with a fake provider, a conversation, Save, reload with `?session=`), and the suites.

Done when that flow keeps Pi's conversations and loads no image, and the suites pass.
