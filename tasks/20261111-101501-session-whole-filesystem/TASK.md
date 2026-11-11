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

Investigating. A save is the kernel's delta against the image the tab booted
(`host/snapshot/kernel.c`); a restore loads that image again (its packs from the browser's pack
store) and replays the delta, so the boot log shows the image loading as a fresh start does.
Measured on the site's `system` route (Chrome): files under `~/.pi/agent/sessions` and
`/workspace` came back after a restore; the baseline is taken before a save is replayed, so a
second save keeps the first one's changes. Not yet reproduced: Pi's conversations missing after a
restore on a page of the npm packages.

Next: reproduce the owner's flow on the 0.1.6 round's images (Pi with a fake provider, a
conversation, Save, reload with `?session=`), find the cause, and make a save hold the whole
filesystem and restore without the image's download, as the owner asks.
