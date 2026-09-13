# Fail exhausted opens before creating or truncating files

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: audit,bug,core,filesystem

## Evidence

Reproduced on runtime `b050e090914a484f38142aac74be95c7d4b41053d1760398da650dbf06ae3814`
in Chrome and Firefox. Fill the process descriptor table by opening /dev/null,
then open an existing four-byte file with O_TRUNC and a new path with O_CREAT.
Both calls return EMFILE, but the existing file becomes empty and the new path
exists. The native Linux control with RLIMIT_NOFILE=256 retains `KEEP` and leaves
the new path absent. Browser errno 33 and Linux errno 24 both mean EMFILE.

`DOLLY_PROCESS_PATH_OPEN` performed openat on the kernel filesystem before
allocating a guest descriptor. When the guest table was full it closed the newly
opened kernel descriptor and returned EMFILE, after the filesystem side effects.

## Done when

- Reserve/check the guest descriptor before any creating/truncating open.
- Failed opens preserve existing bytes and leave a new target absent.
- Closing one descriptor permits an immediate successful retry.
- Cover relative openat paths and verify the native control plus both real browsers.
- Rebuild only the kernel, reuse compatible image artifacts and pass the core gate.

## Result

The kernel now chooses an unused process descriptor before calling openat. A full
table returns EMFILE before any filesystem mutation; failed kernel opens do not
consume the chosen slot. Removed the now-unused allocation wrapper (15 fewer
implementation lines). No ABI, userspace adapter or image recipe changed.

The native regression passes with RLIMIT_NOFILE=256. The actual C fixture now
runs in the core browser gate and verifies existing contents, absent create
target, relative openat, and successful retry after closing one descriptor.
Chrome passed the complete gate in 21.1 s; Firefox in 27.8 s.
All 284 source checks and 28 selected artifact checks pass.

The real kernel build took 25.66 s. New runtime identity:
`cf7fb16004c7477a088c0dd90c0ef1fa69164edfbd19b6e07aa12eed58aa1583`.
The compiler seed, image compatibility ID and every retained snapshot remained
byte-identical. All 20 selected images reused their existing artifacts; the
complete plan inspection took 3.9 s. The only changed recorded identity file was
the runtime build ID.

A separate native-browser background probe passed three 45-second hidden-tab
cycles in Chrome and Firefox 155, including a timed-out HTTP request and C
compilation after resuming. Chrome also froze the page through CDP. Each cycle
retained the in-Wasm filesystem and usable shell; neither browser reported a page
error. These probes exercise the core default image, not a long-running Bhop
match. Logs: `/tmp/dolly-core-{chrome,firefox}-native-background.log`.
