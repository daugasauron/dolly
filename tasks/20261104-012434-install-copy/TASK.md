# An installed input exists twice while the engine installs it

- STATUS: OPEN
- PRIORITY: 150
- TAGS: core,kernel,memory,snapshots

Seen by `core/kernel-copies` (2026-11-04, `tasks/20261104-074503-kernel-copies`), which removed
the kernel's launch and capture copies: while the engine installs an input (FROM, INSTALL, COPY),
the input is in the kernel's memory twice, as its snapshot file and as the files restored from
it: 1.4 GB twice for `pi-local`'s model. The fix is the engine restoring from the Worker's
8 MiB pieces (`dolly_append_file`, the image store) instead of from a whole snapshot file.

Done when: an install's rise is measured before and after on `qwen3.5-2b` and `pi-local` (the
capture's method in `work/evidence-2026-11-04/http/kernel-copies-evidence/`), the second copy is gone, and `test/image-browser.mjs` and `test/image-input-browser.mjs`
pass in Chromium and Firefox with byte-identical snapshots.
