# Remove dead kernel/libc API and dead ABI tooling

- STATUS: OPEN
- PRIORITY: 150
- TAGS: core,cleanup

No callers: `dolly_socket`, `dolly_connect`, `dolly_recv`, `dolly_setsockopt`, `dolly_shutdown`,
`dolly_gethostbyname`, `dolly_getservbyname` (duplicating `__syscall_*` stubs in
`libc-adapter.c:731-813`), `dolly_system`, `dolly_popen`, `dolly_pclose`, `dolly_getpass`,
`dolly_alarm`, process-side `dolly_fclose` (`runtime-adapter.c:661`). Seven spawn wrappers
repeat range checks (`:45`, `163`, `179`, `189`). `scripts/dolly-abi.mjs` keeps an `invoke_*`
`loaderBackedFunctions` set and `GOT.mem` branches that match nothing (`:24-30`, `184-194`,
`324`), re-implemented in `test/dolly.artifacts.mjs:172`. `dolly_snapshot_stream_finish` is
exported but unused. The platform census (`scripts/platform-census.mjs`, docs, test) always
reports the same two imports.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Only used API remains; export derivation is tested, not re-implemented in tests.

## Done when

- Dead symbols and the census are deleted; ABI and browser tests still pass.
