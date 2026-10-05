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

## Review note (2026-10-05, `20261005-131642-big-picture`)

- `20260930-100000-audit-36` is closed into this task. Most items above are
  limits of Dolly's own work-alikes, not of the platform: in-house command C
  is 1,638 lines inline in `Dollyfile-system-build` (22 programs) plus 2,867
  in `src/commands/` (19), beside the unchanged sbase that `system-tools`
  already builds. Prefer deleting an in-house command for its upstream over
  extending it (audit-36 found sbase's `tail`, `du`, `rev`, `tty`, `hostname`
  and `xinstall` free of `fork`; check `tar`, `find` and `xargs`, which spawn);
  record the two line counts before and after.
- `xargs -P`, `&` and `wait` belong to concurrent pipelines
  (`20260930-100000-audit-32`, decision already recorded there).
- Slop's rule in `docs/slop.md` is "features are added only when a useful
  source build needs them". This task adds features because an agent typed
  them. That changes Slop's scope (4,767 lines today) and is the owner's call:
  see the decisions in the big-picture task.
- The limits an agent could not ask for are documented in
  `docs/process-model.md`; shipping the documents in the image is
  `20261005-133403-self-description`.

## Decisions (2026-10-05, `fix/audit-core`)

One line per item: fixed, refused (the message) or documented (where).
`help` now carries the same list inside every image.

Slop (`src/slop.c`; cases in `test/fixtures/slop-cases.mjs`, run against Bash
natively under ASan and in the browser):

- `time` with a compound command: fixed. `time` is a reserved word that times
  the pipeline after it (`time (…)`, `time { …; }`, `time if …`) and returns its
  status; `/bin/time` stays for `env time` and `xargs time`.
- `trap`: fixed for `EXIT`, `HUP`, `INT`, `QUIT`, `TERM`. A signal's action
  runs when the current command has finished, `EXIT` when the shell or a
  subshell leaves. Refused: `trap '' SIGNAL` ("a signal cannot be ignored:
  commands always start with default signal actions"), because the process
  model cannot pass an ignored signal to children; other conditions ("only
  EXIT, HUP, INT, QUIT and TERM can be trapped").
- `wait`: fixed, honestly: Slop starts no background jobs, so `wait` returns 0
  and `wait PID` returns 127 ("not a background job of this shell"). `cmd &`
  stays an error; both move with `20260930-100000-audit-32`.
- `kill`: fixed with sbase's `kill` (`Dollyfile-system-tools`); any process may
  signal any PID.
- `alias`, `unalias`, `jobs`, `fg`, `bg`, `umask`, `ulimit`: refused by name
  with the reason ("aliases are unsupported; define a function", "there are
  no background jobs", "Dolly has no permission bits", "limits are fixed;
  `help` lists them"), status 2.
- `${VAR/pat/rep}`, `${VAR:off:len}`, `$'…'`: refused, as before ("unsupported
  parameter expansion: …", "$'...' quoting is not supported").
- Brace expansion and unmatched globs: documented (`help`, `docs/slop.md`).
  They behave as in POSIX `sh`, where `{a,b}` is a literal word, so there is
  nothing to refuse.
- Scope: `trap`, `wait` and the `time` word are POSIX `sh` or named by this
  task. `docs/slop.md` keeps its rule; whether Slop becomes the shell agents
  write in is the owner's decision in `20261005-131642-big-picture`.

Commands:

- `xargs -P N`: fixed. It runs N commands at once over the kernel's spawn and
  `waitpid(-1)`, as Make does (`src/commands/xargs.c`); the "executes
  serially" message is gone. Slop's own pipelines stay serial (audit-32).
- `patch FILE PATCHFILE`: refused, with the working form ("a FILE operand is
  unsupported: the patch names its files; run patch -pN -i PATCHFILE or patch
  -pN < PATCHFILE"). `patch` is `git apply`; no small upstream `patch` builds
  unchanged here.
- `dd bs=1M`: documented (`docs/slop.md`): sbase's POSIX `dd` takes `bs=1024k`.
- `/dev/zero`: documented as absent (`docs/slop.md`). Devices are registered
  through Emscripten's JavaScript `FS` in `host/runtime/runtime.mjs`, which
  `20261005-133401-kernel-boundary` removes; a device added now would be
  written twice.
- `install -m`: documented (`help`, `docs/architecture.md` "one user, no
  permission bits", `install --help`). It accepts a mode as `chmod` does and
  changes nothing; refusing it would fail every `make install`.
- `tar` only extracts, `gzip` only decompresses: refused, in their usage text
  ("This tar extracts only; it cannot create an archive."), and documented in
  `docs/slop.md`. sbase's `tar` cannot replace the extractor: it rejects the
  pax headers of forge archives, which recipes unpack. Open: no core tool
  creates an archive.
- `id`, `whoami`, `ps`, `df`: documented as absent (`help`, `docs/slop.md`).
  There is one user and libc has no name database (`getpwuid` fails), no
  process-list operation and no mount table. `nproc`: fixed
  (`src/commands/nproc.c`, libc's count, which `make -j$(nproc)` needs).

curl (`src/commands/curl.c`, `src/libcurl-fetch.c`):

- `-m`/`--max-time`: fixed. libcurl's `TIMEOUT`/`TIMEOUT_MS` is a deadline in
  the client that cancels the request through the broker.
- URLs with userinfo: fixed in libcurl, so Git gets it too: the credentials
  become Basic credentials and leave the URL, which Fetch would refuse.
- `--retry`, `-C`: refused by name ("curl: unsupported option: --retry").
- Upstream curl's own tool was not adopted: it needs far more of libcurl than
  the 948-line adapter provides.

cc (`src/compiler.cpp`):

- `-L`/`-l`: on this base `cc` searches `/usr/lib` and takes `-L DIR -l NAME`;
  host clients are `/usr/lib/dolly/process/libdolly-NAME.a` and are linked
  without `-l` when a program calls `<dolly/NAME.h>`. `cc --help` now says so
  and lists `-pthread`. `-ldisplay` still finds `/usr/lib/libdisplay.so`, the
  resident terminal plugin, and the linker says it is a dynamic object.
- `libdolly-js.a`: it is the JavaScript demo's QuickJS embedding
  (`demos/javascript`, `EXPORTS LIB dolly-js`), not a host client; the audit's
  agent took it for one because `libdolly-NAME.a` is the name `cc` gives host
  clients. It should be named for what it is, after its header:
  `libquickjs-runner.a`. Not renamed in this batch: it is demo content in six
  recipes that other agents are changing tonight.
- Headers of modules an image does not declare: shipped, decided. Headers and
  client archives are the compiler's sysroot, the same in every image, and an
  image builds programs for other images. What was missing was the reason at
  the point of failure: the refusal now names the module on the program's
  stderr (`20261005-131643-silent-126`), and `threads.h` says what it needs.

libc (`src/process/libc-adapter.c`):

- `clock()`: fixed. `clock()` and `CLOCK_PROCESS_CPUTIME_ID` report monotonic
  time since the process started; CPU time is not accounted
  (`docs/process-model.md`).
- Limits: fixed for `getrlimit` (256 descriptors, 32 processes, 8 GiB, 8 MiB
  stack) and documented in `help` and `docs/process-model.md`. Open:
  `sysconf(_SC_OPEN_MAX)` is libc's constant 1024, so `getconf` is not shipped.

Display:

- Input record payload and `wait_frame`: documented in `docs/display.md` (a
  table of the fields each record type uses; the frame wait is not a clock).
  `display.h` already documents pointer motion on this base; it was not edited
  because the presenter round owns `host/display` tonight and any edit changes
  the module's digest. The image does not carry `docs/`: `20261005-133403-self-description`.

In-house command lines (audit-36): `src/commands/` 2,936 before, 2,994 after;
inline in `Dollyfile-system-build` 1,630 before, 1,636 after; Slop 4,789
before, 4,957 after. Nothing was replaced by sbase in this batch; checked
with sbase built natively: `tty` needs `ttyname`, `du` needs block counts
WasmFS does not keep, `xinstall` lacks `-c` and `-p` and needs a user
database, `rev` reverses bytes and breaks UTF-8, and `tar` rejects pax
headers. `tail` and `hostname` could be swapped: sbase's `tail` adds `-f` and
drops `-q`, `-v` and the long options the in-house one accepts; that trade
was not verified against the catalog's build scripts tonight.
