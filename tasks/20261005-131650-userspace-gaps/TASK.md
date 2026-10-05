# Userspace gaps an agent hit: Slop, commands, curl, cc and clock()

- STATUS: OPEN
- PRIORITY: 260
- TAGS: userspace,slop,commands,toolchain

What an agent hit while doing ordinary work in the deployed `pi` image
(`~/Downloads/AUDIT-sandbox-painpoints.md` §2-§5, §11, §12). Each item is fixed, refused with a message that says so,
or documented where an agent will read it. Use real upstream (sbase and
friends) before writing code (`20260930-100000-audit-36`).

- Slop: `time` with a compound command reports a wrong status; no `trap`,
  `kill`, `wait`, `umask`, `alias`; no brace expansion, `${VAR/pat/rep}`,
  `${VAR:off:len}`, `$'…'`. (`<<-`, backticks and `unset` are on
  `work/zero-ad-self`.)
- Commands: `patch FILE PATCHFILE`, `dd bs=1M`, `/dev/zero`, `install -m`
  accepting a mode it ignores, tar that only extracts, gzip that only
  decompresses; no `id`, `whoami`, `nproc`, `ps`, `df`.
- `xargs -P N` answers "Dolly executes serially" while `make -jN` runs N
  processes at once.
- curl: no `-m`, `--retry`, `-C`; URLs with userinfo are rejected.
- cc: no `-L` or `-l` search path; the client library is
  `/usr/lib/libdolly-js.a`, which nothing names, while `/usr/lib/libdisplay.so`
  looks linkable and is not.
- `clock()` returns -1 without an error.
- `display.h` does not document the input record payload; `wait_frame` is not
  a frame clock.
- No way to ask for limits: 253 descriptors and the memory ceiling are found
  only by hitting them (`ulimit`, `getconf`, `sysconf`).

Slop, the commands, libc and cc are seed contents: land this as one batch.

## Done when

- Every item has a line here: fixed (commit), refused (message) or documented (where).
- The fixed ones are covered by browser tests.
