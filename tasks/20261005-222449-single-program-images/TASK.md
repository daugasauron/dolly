# Investigate: images that enter their program without a shell

- STATUS: OPEN
- PRIORITY: 295
- TAGS: core,process,images,investigation

Owner direction (2026-10-06): many programs never start another process, and
the project first worked without subprocesses. An image can only omit a
subprocess module if it does not need a shell to start.

## Today (main `230fd887`)

Every one of the runnable images enters through `/bin/foreground -i
/bin/slop …`: Slop spawns the program, `foreground` gives it the terminal and
Ctrl+C, and a recovery shell follows when it exits. `ENTRY /program` directly
is legal Dollyfile 6 but no image uses it.

## Questions

1. What does an image whose ENTRY is its program lose: the recovery shell,
   `foreground`'s interrupt handling, `.dollyrc`, environment set-up from
   `/etc/dolly/environment`? Which of these does the runtime already give the
   ENTRY process itself (the terminal mailbox interrupts a foreground ENTRY,
   `test/host-compute-browser.mjs`)?
2. What should the page do when that program exits or traps: show the status
   and offer a restart, nothing more? Sessions: can such an image be saved
   and restored?
3. What does it gain, measured: boot time to first frame, image size without
   Slop and the core commands, trusted code not exercised.

## Measure

Build one existing graphics demo both ways (for example `gpu-fluid`: as today,
and as `ENTRY /usr/bin/…` with only the packages it needs), in Chrome and
Firefox, and record the differences. The touch demo
(`20261005-222057-touch-input`) should be designed as the first such image if
the result holds.

## Done when

- The comparison and a recommendation are recorded here: whether direct-ENTRY
  images are a supported shape, what the page and runtime must add for them,
  and what the docs should say. The owner decides.

Related: `20261005-222449-spawn-users`.
