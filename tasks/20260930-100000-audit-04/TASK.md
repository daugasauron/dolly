# chmod, chown and fchmod report success without doing anything

- STATUS: OPEN
- PRIORITY: 260
- TAGS: bug,core,compatibility

`src/process/libc-adapter.c:677-713` returns 0 for chmod/fchmod/fchown/chown without even
checking that the path exists. AGENTS.md requires unsupported operations to fail explicitly.

## Evidence

Established: REPRODUCED. Chrome, `default` image: `! chmod 644 /tmp/does-not-exist` -> status 1
(chmod succeeded).

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Missing paths fail with ENOENT; the supported subset (e.g. recording mode bits in WasmFS, or
explicit ENOSYS/EPERM for ownership) is honest and documented.

## Done when

- Browser check: `chmod 644 /missing` fails with ENOENT; `chmod` on an existing file either
  changes `stat` mode or fails explicitly; same for `chown`.
