# Guest-controlled sizes reach trusted allocations and file reads

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: security,core,kernel,boundary

The HTTP body staging buffer is `malloc` of a guest-chosen size per process and thread
(`src/process-kernel.c:1496-1500`), able to exhaust kernel memory for everyone. Trusted JS reads
guest-writable `/etc/dolly/entry`, `/etc/dolly/image` and, on boot errors,
`/tmp/dolly-cc-trace.log` without size limits (`src/runtime-worker.mjs:67`, `369`, `394-397`).
The clock fast path reads the clock id twice from shared memory
(`src/process-worker.mjs:501-502`).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`. Worst outcome is denial of service;
text is rendered with textContent.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Every guest-controlled size crossing into trusted code or shared kernel state has an explicit
bound; shared memory is read once.

## Done when

- Bounds are enforced and exercised by tests that submit oversized values and observe an
  explicit error instead of kernel memory growth.

## Progress (2026-10-01)

HTTP body staging is capped at 8 MiB (`E2BIG`, tested by
`src/process/http-check.c` from `test/network-browser.mjs`) and freed when a
thread or process ends. Trusted reads of `/etc/dolly/entry`, `/etc/dolly/image`
and the compiler trace use `readBoundedFile`; the clock id is read once.
Missing: tests for the boot-file bounds. Sessions cannot carry an oversized
`/etc/dolly/entry`: `dolly_session_excluded_path` drops `/etc/dolly/*`, and a
65 KiB entry written in a live session came back as the image's 78-byte entry
after reload (checked 2026-10-01). A test therefore needs a custom image whose
build leaves an oversized entry.

## Closed (2026-10-05, big-picture review)

The bounds are enforced (recorded above). The missing test for an oversized
boot file moved to `20261005-133401-kernel-boundary`, where the bounded read
becomes a kernel export and the test is in the done-when.
