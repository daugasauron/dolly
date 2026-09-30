# Process ABI identity hashes header comments but not the value encodings

- STATUS: CLOSED
- PRIORITY: 170
- TAGS: core,kernel,maintainability

`scripts/dolly-abi.mjs:288-310` hashes the raw bytes of `process.h`, comments included, so
fixing a comment invalidates every executable, image and session. Meanwhile the ABI depends on
bootstrap-libc numbering no header defines: FD_GET_FLAGS/FD_SET_FLAGS pass raw musl `O_*` values
to fcntl (`src/process-kernel.c:1814-1853`), `stat.mode` is raw `st_mode` (`:824`), seek
`whence` (`:1698`) and clock ids (`:2242`) are undocumented. `process.h:202,398` comments say
only INT/KILL/TERM are supported; the real set is 0, HUP, INT, QUIT, ABRT, KILL, PIPE, TERM,
WINCH (`process-kernel.c:274-278`).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

The ABI contract defines the encodings it depends on and its identity covers them, not prose.

## Done when

- Encodings are named constants in the contract and checked by the ABI tests.
- Changing a comment in `process.h` does not change the ABI identity; changing an encoding does.

## Resolution (2026-09-30)

By design: executable identity hashes the exact bytes of process.h, so any change rebuilds everything downstream (owner: replicability over rebuild time). Value encodings are now also defined explicitly in process.h.
