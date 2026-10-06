# read() of a regular file returns at most 1 MiB per call

- STATUS: OPEN
- PRIORITY: 230
- TAGS: bug,process,filesystem

Found by the Xonotic port (`tasks/20261006-122433-xonotic`): DarkPlaces loads a
file with one `read()` of its size and keeps what it gets, so a loose 6.6 MB
`progs.dat` loaded truncated in Dolly ("No classname for" every entity, "QC
function StartFrame is missing") while the same file played a full match
natively. Measured in `xonotic-build` with a 16 MiB `read()` of the
3,424,516-byte `/usr/bin/xonotic-dedicated`: the first call returned
1,048,576 bytes; a loop read the rest; `cp` copies whole.

## Cause

`src/process/libc-adapter.c`: `__wasi_fd_read` deliberately issued one process
gate packet (`DOLLY_PROCESS_PACKET_LIMIT`, 1 MiB) and returned its size, citing
POSIX's permission for short reads. Linux never returns less than asked from a
regular file before end of file, and a great deal of software assumes it; a
real upstream program found the requirement. `__wasi_fd_pread` already looped
over packets until the request was filled or a packet came back short.
`__wasi_fd_write` and `__wasi_fd_pwrite` loop over `DOLLY_PROCESS_IO_CHUNK`
packets until everything is written or a packet writes nothing, so a write of
3.4 MB to a regular file lands whole: `write` has no such limit.

## Fix (branch `core/full-read`, from `integrate/next` 8f4900c6)

- `fd_read_full` in the adapter: `read` and `readv` keep requesting packets
  while the previous one came back full and the descriptor is a regular file
  (one `DOLLY_PROCESS_FD_STAT` call, made only after a full first packet, so
  reads of pipes, terminals and small files pay nothing); an error or handled
  signal after some bytes returns those bytes, as Linux does. Pipes and
  terminals still return what is there, because a second packet could block.
  `readv` gathers into a buffer of the vectors' full size instead of 1 MiB.
- `test/fixtures/process-full-read.c`, run by `test/process-browser.mjs`: one
  read of 16 MiB returns a 3,424,516-byte file whole with its contents, a
  second read returns 0, `pread` of 64 KiB across the megabyte boundary,
  `readv` of two vectors straddling it, one `write` of the file, and a pipe
  read returning the 4 bytes written. It passes on Linux unchanged
  (`gcc -O0 -Wall -Wextra`, prints `FULL-READ-OK`).

## Checked and not checked

- Native: the fixture passes on the host; `gcc -fsyntax-only` over the
  adapter against the Emscripten sysroot headers reports nothing.
- Not checked: the adapter compiles only in the container seed build, and the
  browser suite runs in the chain build of `integrate/round3`; this branch was
  not built or run in a browser.

## Done when

The process suite passes in Chromium and Firefox with the fixture, and the
DarkPlaces patch's sixth hunk (`demos/xonotic/darkplaces-dolly.patch`, which
loops the read under `__dolly__`) is removed.
