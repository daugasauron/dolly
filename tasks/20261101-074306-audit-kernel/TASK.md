# Audit: the kernel, the process contract and the libc adapter

- STATUS: OPEN
- PRIORITY: 300
- TAGS: core,audit,kernel

Agent B, night of 2026-11-01 (rules: `work/AGENT-RULES-2026-11-01.md`), on
`core/audit-kernel` from `main` 577aafb1. Scope: `abi/*.wat`, `include/dolly/*.h`,
the kernel (`src/process-kernel.c`, `src/dolly.c`, `src/libc-host.c`,
`src/system-snapshot.c`, `src/file-blocks.cpp`, `src/device-lease.c`, the record
headers), `scripts/build.sh` and `scripts/dolly-abi.mjs`, the process side
(`src/process/`) and the JavaScript that hosts processes (supervisor, Worker,
ABI validator, kernel plugin loader), and their tests. Thread memory growth and
pack merging are agent E's tonight.

Done when every part has been read against `AGENTS.md`, what the investigation
confirms is fixed with a test that failed before (or code gone and nothing
broken), the moot is closed with its reason and the uncertain rest is a few
lines each below.

## State (2026-11-01 22:45 JST)

Read: the whole of the scope above. Baseline: build reproducible (same runtime
and image ids), source suite 446/446 in 27 s, `process-browser` passes in
Chromium (58 s). Items 1-27 are committed and verified on `default,system`
and `libdolly-sockets` built from the newest seed (image inputs
`cf6b9518…`): `process`, `core`, `threads`, `sockets`, `slop`, `shell`,
`terminal`, `pty` and `default` pass in Chromium and Firefox on it, and
`process` passed three times in a row on an earlier seed. The libc items
need a catalog round (the integrator's of 2026-11-02 00:30).

## The shape of it

The contract itself is lean and holds: 47 operations, pointer-free bounded
packets, one import, errors as one vocabulary, a malformed call an errno.
Nothing tonight wanted a new operation except the dispositions proposal
below. The defects sat at three seams:

- **libc and kernel each holding half of signal state.** Dispositions live
  in libc, the kernel guesses: EXIT's override, the signal-before-start
  rule, spawn's refusal for an ignored signal, no reaping for an ignored
  SIGCHLD. Fixed where the kernel already knew enough; the rest is the
  first proposal.
- **WasmFS is Emscripten's filesystem, not POSIX's.** The kernel delegates
  paths and files to it and corrected four answers at its call sites
  (trailing slash, truncation through a read-only descriptor, the hard link
  errno, the directory reader's read-ahead). The portable part of
  `process-descriptors.c`, compiled natively under sanitizers by the source
  suite, is where such answers are now pinned to Linux's.
- **Emscripten's libc stubs, written for a JavaScript host.** `abort`
  trapped, `getpriority` gave the wrong encoding, `pthread_cancel` claimed
  success, `getpass` was missing; Dolly had copies or nothing. A sweep of
  `emscripten_syscall_stubs.c`, `library_pthread_stub.c` and
  `standalone.c` against POSIX was done tonight for what the probes hit;
  what is left there answers ENOSYS or what is true.

## Fixed

Each with a test that failed before, verified in Chromium and Firefox.

1. **A signal the old program ignored ended the program `exec` started.**
   Between the commit of an exec and the new Worker's start the kernel ended
   the process for any signal but SIGWINCH, and the supervisor did the same on
   its own for any process not yet started (`!process.started`), so a `nohup`
   style program that ignores SIGHUP and execs died of a hang-up arriving in
   that window. The kernel knows what the old program left
   (`start_signals`): now a signal it ignored is nothing, one it blocked waits,
   anything else ends the process as before. The supervisor no longer decides
   this itself: it asks the kernel whether the signal ended the process
   (`dolly_process_exited`) and retires it then, so the rule lives in one
   place. Test: `process-exec.c` check mode spawns a program that ignores
   SIGHUP, reports it on a pipe and execs, and sends it SIGHUP until it ends;
   before, ended by SIGHUP (Chromium), now status 46 (see 17 for the rest of
   that story). Kernel C and page JavaScript only.
2. **Dead kernel code.** `interrupt_deadline` and `DOLLY_KERNEL_INTERRUPT_GRACE`
   were written on every signal and read nowhere since `328a4017` (a child
   outlives its parent) removed their reader. `prune_path` spared `/seed`,
   which `97c34d4d` (the seed as a snapshot) removed from everything else. A
   loop in the spawn of an inherited environment checked an addition against
   `environment_bytes`, which is zero on that path.
3. **Doc rot.** `docs/process-model.md` said posix_spawn file actions other
   than dup2 and close fail with ENOTSUP; `84bb1d10` added `addopen` (and
   `addchdir_np` is there too) without the bullet.
4. **Ctrl+C at a program in `system()` ended the program.** POSIX has
   `system()` ignore SIGINT and SIGQUIT and block SIGCHLD in its caller while
   the command runs; Dolly's (`runtime-adapter.c`, from the first checkpoint
   `b95459ce`) did none of it, so Ctrl+C ended the caller with its command.
   Test: `process-interrupt system` in `process-browser`: status 130 and no
   marker before, the command ends and the program goes on now. Seed input.
5. **`popen(…, "re")` gave the caller's end no FD_CLOEXEC** (glibc and musl
   honour `e`). Test in `process-lifecycle.c`. Seed input.
6. **`pthread_cancel` claimed success** in a program without `-pthread`:
   Emscripten's `library_pthread_stub.c` returns 0 and cancels nothing. Now
   ENOTSUP, as the threads@0 profile already answers. Probe before: `cancel 0`.
   Test in `process-lifecycle.c`. Seed input.
7. **`getpass` echoed the password and read standard input.** Dolly's own
   (`b95459ce`, no reason recorded) printed the prompt on stderr and read
   stdin with `fgets`; musl's opens `/dev/tty`, clears ECHO and restores the
   mode, which Dolly's termios now supports. Git's credential prompt is
   `getpass` here (no `HAVE_DEV_TTY`). Emscripten's libc leaves musl's
   `legacy/getpass.c` out (its `system_libs.py` takes three files of that
   directory), which is why Dolly had a copy: the build now compiles musl's
   file into the runtime client, as it does `getdate`, and Dolly's copy is
   gone. `terminal-browser` types a password at `getpass` with stdin from
   /dev/null: before, the prompt was never waited at (fgets of /dev/null),
   now it is read and not shown. Seed input.
8. **`kill` of a child that has exited and is not yet waited for failed with
   ESRCH**; POSIX (and Linux) keep it until it is waited for: success,
   nothing happens. Kernel C. Test in `process-lifecycle.c`.
9. **`rewinddir`/`seekdir` after a partial read returned entries twice.**
   The kernel reads a directory through a `DIR` of its own per descriptor,
   which holds read-ahead; an `lseek` of the descriptor (musl's rewinddir and
   seekdir) left that read-ahead to be returned first. A `SEEK_SET` now drops
   the kernel's reader. Common `readdir` loops do not show it (the guest's
   and the kernel's buffers both take 7 entries), `getdents` with another
   buffer size does. Test in `process-descriptors.c`. Kernel C.
10. `scripts/build.sh` removed five outputs no build has made since
    2026-09-06 (`slop-process.wasm`, `process-check.wasm` and two more) and
    `ghostty-web.js` (2026-08-31).
11. **`getppid` never changed.** libc cached the parent with the pid on the
    first call (`018c5f27`, when a parent's exit still took its children);
    since `328a4017` a child outlives its parent and has parent 0, and a
    program that watches `getppid` to learn its parent ended never saw it.
    The pid stays cached, the parent is asked. Test in `process-lifecycle.c`
    (`adopting`). Seed input.
12. **A spawn without an environment gave the child the one its parent
    started with.** `dolly_spawn_*` with `envp` NULL set
    `SPAWN_INHERIT_ENVIRONMENT`, and the kernel, which never sees a process's
    `environ`, copied the parent's starting environment: a variable the
    parent set was missing. libc now sends `environ`. Test in
    `process-lifecycle.c` (`cwd`). Seed input.
13. `runtime.h` said socket functions all fail; with sockets@0 they do not,
    and the process model documents both. The comment is gone. Seed input.
14. **`fsync` and `ftruncate` of a pipe failed with ESPIPE**, an errno POSIX
    does not list for them; it and Linux say EINVAL. Kernel C. The check in
    `process-descriptors.c` runs natively too, where Linux agrees.
15. `waitpid(-PID)` failed with ECHILD although `kill(-PID)` signals the
    child PID, its own group. It now waits for that child. Seed input.
    Test in `process-lifecycle.c`.

16. **A comparison of 88 file and process calls against Linux**
    (`build/audit-kernel-evidence/probes/posix-edges.c`, the same program
    natively and in `system`) found four kernel answers that differed with
    no reason, all fixed and checked in `process-descriptors.c`, whose
    portable part runs natively too:
    - `ftruncate` through a descriptor open only for reading **truncated
      the file** (WasmFS does not check); EINVAL now, as POSIX and Linux say.
    - A path ending in a slash resolved as if it had none: `open("file/")`
      and `stat("file/")` succeeded on a regular file, and
      `open("new/", O_CREAT)` made a regular file `new`. Now ENOTDIR for a
      path that names something that is not a directory, EISDIR for a slash
      with `O_CREAT`.
    - `poll` of a regular file open only for writing did not report it
      readable; POSIX: regular files always poll true for both.
    - `link` failed with EMLINK, WasmFS's word for having no hard links;
      Linux's for a filesystem without them is EPERM, on which programs
      fall back to a copy.
    The other differences are Dolly's documented limits (1024 descriptors,
    no hard links, whole-mapping `munmap`, no FIFOs, a 64 KiB page),
    `futimens` of a pipe failing with ESPIPE, which is left, and `nice(0)`
    failing with EPERM, fixed in 18.

17. **A program that exited while a signal it ignores was pending was
    recorded as killed by it.** The kernel's EXIT took the lowest pending
    terminating signal over the status the program gave: from the first
    checkpoint, when libc ran no handlers and a program woken by EINTR could
    only fail ("must not let an otherwise signal-unaware program turn Ctrl-C
    into an arbitrary failure status"). Since `signal.c` every call that
    returns EINTR takes the signal and acts on its disposition, so the rule
    only ever fired for a signal that arrived after the program's last call:
    a `nohup`'d program exiting 46 under SIGHUPs was recorded as ended by
    SIGHUP (5 of 6 runs, `kill` without pause). EXIT now records what the
    program says. The exec fixture's hang-ups now come without pause; 6 of 6
    pass. Kernel C. (An earlier note here blamed the supervisor's 500 ms
    grace for that death; with the EXIT rule gone the grace never fired, in
    800 ms of hang-ups either.)

18. **The same comparison for 56 process and signal calls**
    (`probes/process-edges.c`) found:
    - **`abort()` trapped** (Emscripten's `_abort_js`): the process "failed:
      unreachable" with status 126 instead of ending by SIGABRT (134), and
      a SIGABRT handler never ran. Assertion failures go through it. libc's
      `abort` is now POSIX's: the handler runs, and if it returns, or the
      signal is blocked or ignored, the process ends by SIGABRT. Seed input.
    - **`getpriority` answered 20**, the lowest priority: Emscripten's stub
      returns 0 where musl expects the kernel's encoding (20 minus the nice
      value), so `nice(0)` then tried nice 19 and failed. One priority is
      there, nice 0; setting it succeeds, any other EPERM. Seed input.
    - `setrlimit` to the limits a process has failed with EPERM; it succeeds
      now, and anything else is still EPERM. `waitpid` with an unknown
      option failed with ENOTSUP; POSIX says EINVAL. Seed input.
    - `execve` (and `posix_spawn`) of a directory failed with ENOEXEC;
      POSIX says EACCES for a file that is not regular. Kernel C.
    Left: `setpgid` of another process answers EPERM where Linux answers
    ESRCH for one that is not a child; `CLOCK_THREAD_CPUTIME_ID` is EINVAL
    while the process clock is answered; `sysconf(_SC_CHILD_MAX)` is libc's
    1024, not the 56 of `RLIMIT_NPROC`; `sched_getscheduler` does not link.

19. **Pipes, poll and threads compared too** (`probes/pipe-edges.c`,
    `probes/thread-edges.c`, -pthread). The write end of a pipe without a
    reader polled `POLLERR|POLLHUP` and not writable; POSIX keeps POLLHUP
    for the read end's news that the writers went, and Linux answers
    `POLLOUT|POLLERR` (the write fails at once). Now so. Kernel C; the
    check in `process-descriptors.c` runs natively too. Left, with reasons:
    `FIONREAD` fails with ENOTTY (no operation tells the bytes a pipe or
    socket holds: a contract addition, not wanted by a program found);
    `gettid()` of a threaded program's first thread is its threads@0
    number, not its pid as on Linux (threads@0's numbering, agent E's
    tonight); guard pages, directed signals and cancellation are ENOTSUP,
    as documented. `pthread_setname_np` did not link with `-pthread`: 20.

20. **mmap compared too** (`probes/mmap-edges.c`). `mmap` with `PROT_EXEC`
    failed with ENOMEM: libc returned EPERM, which musl's wrapper "fixes" to
    ENOMEM for an anonymous mapping, so a JIT read it as memory exhausted;
    ENOTSUP now, POSIX's word for a protection not given. Mapping a
    directory failed with EISDIR (a pipe with ESPIPE); POSIX and Linux say
    ENODEV. `munmap` of a range that holds no mapping failed with EINVAL;
    POSIX unmaps it as nothing. `pthread_setname_np` was defined for the
    serial profile only; it links with `-pthread` now (ENOSYS in both, as
    `pthread_getname_np`). Checks in
    `mmap-bounds.c`, which runs natively too, and `threads-pthread.c`. Seed
    input. Left as documented: `mprotect` to less than read and write,
    `MAP_FIXED`, partial `munmap`; `mremap` is ENOMEM and `mincore` ENOSYS
    (Emscripten's), `mlock` succeeds (memory is never paged out).

21. `terminal-browser` failed twice in six runs at its `read word` step: the
    keys it types raced the command `start()` had not yet submitted, and the
    shell read `yeread word …` (127). The test now waits for the command
    line before it types. (`default-browser` fails in a tree whose catalog
    is narrowed: its welcome names packages `amy-index.txt` lists only for
    the whole catalog; `generate-routes` restores it.)

22. **A slash after a symbolic link did not follow it.** `lstat("link/")`
    answered the link, not the directory it names, and `unlink("link/")`
    removed the link, where Linux refuses (ENOTDIR): `ls -l link/` showed the
    link and `rm -r link/` took it. The kernel now resolves such a path as
    "link/.", which WasmFS follows; removing or renaming it is refused
    (EISDIR or EINVAL, not Linux's ENOTDIR). That showed a WasmFS rename of
    "dir/." moving the directory: a rename whose last name is a dot now fails
    with POSIX's EINVAL (Linux: EBUSY). And `open` with `O_CREAT` through a
    link to a file not there yet failed with ENOENT where POSIX creates the
    file, and with `O_EXCL` too, where POSIX says EEXIST: the kernel now
    follows the link (40 deep) itself. Found by a third comparison
    (`probes/more-edges.c`, 150 calls: descriptor flags, the `*at` calls,
    locks, vectored I/O, waits, terminal calls on files). Kernel C. Test
    `link_answers` in `process-descriptors.c`, which Linux passes too:
    before, failed at its first check (Chromium), now passes in Chromium and
    Firefox.

23. **`wait4` (and `wait3`) with a usage buffer failed with ENOTSUP**, from
    before `getrusage` had a rule for times (`d5badb25`, 2026-09-06; the
    rule came with `03717431`, 2026-10-23): GNU and BusyBox `time` and
    Python's `os.wait4` wait so. It now waits and reports the child's times
    as `getrusage` reports children's: zero. Seed input. Test in
    `process-lifecycle.c`. The same comparison found no other defect worth
    a line: Linux's own calls (`copy_file_range`, `renameat2`, `syncfs`,
    `fallocate`, `sigqueue`) do not link, `pwrite` with `O_APPEND` writes
    where it is told as POSIX says (Linux appends), `sigtimedwait` and
    `sigwait` are ENOTSUP, `waitid` refuses `WNOWAIT`, and a file that is
    unlinked while open keeps `st_nlink` 1 (WasmFS).

24. **Truncating a file left its modification time.** WasmFS marks it on a
    write but not when `ftruncate` or `open` with `O_TRUNC` empties the
    file, so `: > stamp`, make's way to renew a stamp, left it as old as
    before and the rule ran again on every make. POSIX marks it for both;
    the kernel now does (`mark_truncated`). Found by a fourth comparison
    (`probes/stamp-edges.c`: times, inode numbers and sizes as make, git
    and rsync read them). Kernel C. Test `truncation_times` in
    `process-descriptors.c`, which Linux passes too: before, failed at its
    first check (Chromium), now passes in Chromium and Firefox. Left: a
    write, rename or chmod does not move `st_ctime` (WasmFS marks it only
    on its own chmod, which Dolly's libc never calls, there being no
    permission bits), so ctime is the creation time; git and make compare
    mtime and size too, which do move. Directories count one link, as on
    btrfs.

25. **The terminal had a position, and `/dev/tty` was a regular file.** The
    terminal's output device (`TerminalFile` in `file-blocks.cpp`, since
    `ff3a5c19`) was made as WasmFS's default kind of file: `lseek(1, 0,
    SEEK_CUR)` on the terminal answered the bytes written (527) where Linux
    says ESPIPE, so Python's `sys.stdout.seekable()` was true, and
    `stat("/dev/tty")` and `stat("/dev/zero")` said regular file, so `test
    -c /dev/tty` failed. The kernel's FD_STAT hid it for descriptors 0-2 by
    calling any terminal descriptor a character device. Both devices are now
    character devices, the terminal unseekable, and FD_STAT's correction is
    gone. Kernel C++. Test `device_answers` in `process-descriptors.c`
    (Linux passes it under `script`); before, `probes/tty-identity.c` read
    mode 100666 and the position (Chromium), now 20666 and ESPIPE;
    `process`, `terminal`, `pty` and `default` pass in Chromium and Firefox.

26. **Every terminal's line speed read as B0, hung up.** TCGETS gave the
    speed in musl's unused `__c_ospeed` field while musl's `cfgetospeed`
    reads it from `c_cflag`. Emacs, for one, turns B0 into 1200 baud
    (`init_baud_rate`), so its isearch ran in slow-terminal mode, showing
    the line it reached in a one-line window, and its redisplay costed
    scrolling for 1200 baud. `c_cflag` now carries B38400, as a Linux pty
    reports. Found by a fifth comparison (`probes/term-edges.c`, on the
    terminal itself; natively under `script`). Seed input. Check in
    `device_answers` (`process-descriptors.c`), which Linux passes too.
    The rest of that comparison is the documented terminal: VMIN 0, IXON,
    VSUSP and output mappings other than ONLCR refused with EINVAL,
    `tcflow` and `tcsendbreak` ENOTSUP, no process group to get or set.

27. **`getaddrinfo` failed with EAI_FAIL for a numeric address** (found by
    agent F's FFmpeg port: `tcp://127.0.0.1:9` said "Failed to resolve
    hostname 127.0.0.1: Non-recoverable error"), with `AI_NUMERICHOST`
    too, and `getnameinfo` failed for any address. Both were stubs from the
    first checkpoint (`b95459ce`). POSIX converts a numeric host and port
    without a lookup: Dolly's `getaddrinfo` now does (musl's answers: IPv4
    before IPv6, a stream and a datagram entry, EAI_SERVICE above port
    65535, EAI_NONAME for a family that does not match), and `getnameinfo`
    gives the numeric host and port unless `NI_NAMEREQD`. A name still
    fails with EAI_FAIL, there being no resolver, and an AF_INET socket
    then refuses with EAFNOSUPPORT, where FFmpeg reports it. Compared with
    glibc over 2016 combinations of host, service, family, type and flags
    (`gai-compare.c`, under sanitizers): the differences are glibc's own
    (a SOCK_RAW entry, IPv6 first, port 65536 wrapping to 0,
    EAI_ADDRFAMILY). musl's own `getaddrinfo` is not usable: Emscripten's
    `lookup_name.o` resolves through a JavaScript import. Seed input. Test
    `address_answers` in `process-descriptors.c`, which Linux passes too:
    before, failed at its first check (Chromium).

## Proposals for the owner

- **The kernel told each disposition, and a spawned child that keeps what
  its parent ignores.** Dispositions live in libc; the kernel learns one
  only for SIGALRM (`ALARM_HANDLED`, op 71). Three things follow from not
  knowing the rest, each measured tonight: `posix_spawn` from a program
  that ignores any signal fails with ENOTSUP unless the attributes reset it
  (`spawn_signals_supported`), so the common `signal(SIGPIPE, SIG_IGN)` or
  `signal(SIGCHLD, SIG_IGN)` program cannot start one (probe
  `sigchld-ignore.c`: 0 of 80 spawned; Linux 80); with SIGCHLD ignored POSIX
  reaps exited children itself, which Dolly cannot, so a daemon that relies
  on it fills the 56-slot table with zombies; and a signal a program
  ignores still arms the supervisor's 500 ms forced termination until libc
  acknowledges it. One operation in place of op 71 (libc reports the
  ignored and handled masks on each change) lets the kernel reap for an
  ignored SIGCHLD, skip the grace for an ignored signal, and give a spawned
  child the parent's ignored set and mask as EXEC already does
  (`dolly_process_exec_state` in `dolly_process_spawn_request`, 56 to 72
  bytes), dropping `spawn_signals_supported`. A layout change of
  `process.h`: every executable's identity, the seed compiler's restamp and
  a catalog round. No program of the catalog is known to hit the spawn
  refusal today (git spawns through its Dolly patch, CPython and libuv
  through `dolly_spawn_mapped`, Rust's std resets SIGPIPE in its
  attributes).

- **Session saves with modification times.** A save holds no timestamps
  (`docs/sessions.md`), so after a restore every file is as old as the
  restore and make compares the replay's order, not the edits': a source
  edited after its last build can look older than the target. A time per
  record (8 bytes in `session-records.h`) would keep make's answers across
  a reload; a record format change.
- **Inherited environments for the page's spawns only.** After 12 no
  process asks the kernel to inherit an environment; only the supervisor's
  root spawns do (`encodeSpawn`, parent 0, the kernel's own `environ`). The
  kernel's branch that copies a parent's starting environment (15 lines of
  `spawn_packet`) can refuse with EINVAL instead. Kernel C only, but it
  narrows what `process.h` allows.
- **`dolly-image-0.wat`: two exports that carry nothing.**
  `dolly_process_bootstrap_resume_prepare`'s second parameter must be 1
  since Dollyfile v3 (`99093739`, when it stopped counting cached modules),
  and `dolly_snapshot_format_version` is called by nothing but a test that
  instantiates the contract file itself, never the kernel. Dropping both
  changes the image contract, an image input: a catalog round.

## Uncertain, left

- `cc`, `c++`, `ld` and `ar` run the compiler up to three times when it
  ends with status 126 (`dolly_toolchain_proxy`, restored by `5221de89`
  with its reason: a transient Worker allocation failure in long builds).
  Since `2b9fd4a4` (2026-10-23) the supervisor itself asks a refused memory
  reservation again for up to 5 s, which is that failure's cause; a 126
  that is deterministic (a trap, a stack exhausted in Firefox, which has no
  larger JSPI stack) now costs three compiles before it is reported. Not
  measured whether any transient 126 is left; not changed, as the owner
  restored this once.
- libc's `ioctl(TIOCSWINSZ)` sends pty@0's operation itself
  (`DOLLY_PTY_RESIZE`, `libc-adapter.c` includes `<dolly/pty.h>`): the base
  libc knows a host module's number, which the module's client could own.
  Small; left for whoever next touches pty@0.

## Views on agent E's two commits (read only)

- `a15a3c6c` (a threaded process starts at its maximum memory) is a
  measured workaround for a V8 defect (Chrome 156 bounds-checks
  `memory.copy`, `fill` and atomics against a stale size after another
  thread grew the memory); Firefox has none. Its costs: every threaded
  process reserves its whole maximum (8 GiB for a program linked with the
  default), and the supervisor's event loop, which serves every process's
  calls, waits in `Atomics.wait` and then spins on `buffer.byteLength` while
  the grower Worker grows it. It deserves a line naming the Chrome version
  to recheck, as `511cd751`'s Firefox workaround has.
- `1d12850b` (a package's snapshot merged from its packs) adds
  `src/sha256.mjs` beside the kernel's `src/sha256.h`: two SHA-256s, one per
  side of the boundary, because WebCrypto has no incremental digest. Where
  the bytes end in the kernel anyway (`dolly_snapshot_stream_*` already
  hashes a streamed image in Wasm), the check could be the kernel's alone;
  where the page must refuse bytes before the guest sees them, the second
  copy is the price.

## Findings, not changed

- What two processes share through a file (`probes/share-edges.c`: an
  inherited offset, appends from two descriptions, `fcntl` and `flock`
  locks against each other and inherited, a pipe) answers as on Linux.

- `ttyname` of the terminal fails (ENOENT): musl reads `/proc/self/fd/N`,
  which the kernel does not answer, and would then find the descriptor's
  identity differs from `/dev/tty`'s (the terminal's streams are WasmFS's
  `/dev/stdin` and the kernel's output devices). Python's `os.ttyname`
  fails; `tty` prints `/dev/tty`. `/dev/fd/N` is absent too, so zsh has
  neither it nor FIFOs for `<(…)`. Both would be kernel additions; no
  program of the catalog was found to need them.

- Clocks, identity and environment (`probes/misc-edges.c`) showed nothing
  to fix: Linux's own clocks (`CLOCK_BOOTTIME`, `_RAW`, `_COARSE`) are
  EINVAL, so a program falls back to the POSIX ones; `gethostname` truncates
  as POSIX allows; `umask` changes no mode, as decided. POSIX timers
  (`timer_create`) and `sethostname` do not link: absent, which a configure
  finds.
- **A system call costs 8-25 µs in Chromium and 11-35 µs in Firefox**, with
  the load of the machine (20,000 `fcntl(F_GETFD)`, `-O2`, `system` image;
  23-25 and 31-35 at the start of the night): a postMessage, the
  runtime Worker's event loop and an Atomics wait. Writes go in 16 KiB
  packets (`DOLLY_PROCESS_IO_CHUNK`, since `b95459ce`) while reads take
  1 MiB: 64 MiB written in 1 MiB calls take 0.12-0.16 s (410-550 MiB/s),
  read back in 0.010-0.026 s. A 64 KiB write packet (the pipe's capacity)
  would make bulk file writes about 4x cheaper without copying more than a
  pipe takes on each retry of a blocked write; it is a seed change for a gain
  no measured workload has shown yet (a 78 MB link output is ~0.14 s of
  calls), so it is left.
- Of a 23-25 µs call the hop itself is the smaller part: a Worker's blocking
  round trip by `postMessage` and `Atomics.wait`, as `process-worker.mjs`
  makes it, takes 9.8 µs in Chrome, and 6.2 µs with `Atomics.waitAsync`
  in its place (20,000 round trips, `build/audit-kernel-evidence/bench`);
  posting the call as an object of nine fields instead of a number costs
  4.3 µs more. Two page-side changes were tried and dropped, as neither
  showed against the noise of a shared machine (a call measured 8-25 µs in
  Chrome and 11-26 µs in Firefox from run to run, interleaved A/B, three
  runs each): the call's fields in the control buffer and a number as the
  message, and scheduling launches only after a spawn instead of after
  every call. A `waitAsync` protocol is not worth its complexity on these
  numbers. (The benchmark page hung in Firefox once in each mode; not looked
  into, Dolly's own calls work there.)

## abort under the whole archive (2026-11-02, day round, `fix/abort-own-definition`)

The catalog round on integrate/2026-11-02 failed `zero-ad-engine` at the
link of `spidermonkey-check`: `duplicate symbol: abort`, defined in
`libjs_static.a(Unified_cpp_memory_mozalloc0.o)` and in
`libdolly-process.a(process-abort.o)`. Item 15's `abort` (e0c73f1c) is the
first libc function in `libdolly-process.a` that a real program also
defines, and that archive is linked whole: `src/compiler.cpp` (907),
`scripts/build.sh` (`build_process`, `build_process_cxx`) and
`demos/rust/toolchain/link.sh` all pass `--whole-archive`, so every member
goes in and a member boundary (129d9fe1's `abort.c`) changes nothing.
129d9fe1 also left the threaded archive without `abort`:
`scripts/build-process-threads.sh` compiles `signal.c`, not `abort.c`, so
`-pthread` programs trapped again.

Fix: 129d9fe1 reverted (822aebd5); `abort` is `__attribute__((__weak__))`
in `signal.c` (36367ba3), with its comment saying why. Measured in the seed
toolchain with `wasm-ld --trace-symbol=abort`, the link line of
`build_process` (`build/abort-evidence/link-probe*.log`):

| archive | program's own abort | result |
|---|---|---|
| 129d9fe1's (strong) | object | `duplicate symbol: abort` |
| weak | object | program's definition |
| weak | archive member the program references | program's definition |
| weak | none | `process-signal.o`; `libc-ww.a(abort.o)` is not fetched |
| none (Emscripten's) | none | `libc-ww.a(abort.o)` |

One corner differs from a static libc, measured in `link-probe-4.log`: a
program's `abort` in an archive member that nothing in the program's own
objects references (only a later library does, here dlmalloc's `sbrk.o`) is
not fetched; the whole archive's definition, weak or strong, replaces the
lazy symbol and is the one linked. An ordinarily linked archive takes the
program's. The mozalloc case is not this one (SpiderMonkey's code references
the member), so the smaller change stands; `abort` in `libdolly-runtime.a`
would have those semantics at the price of a member in two builds, the shape
129d9fe1's regression had.

Finding, not changed: `--whole-archive` is from the first checkpoint
(`b95459ce`, 2026-09-05), no reason recorded. What it does today: the libc
adapter's definitions (`raise`, `sigaction`, `getpid`, ...) go in whether
or not referenced, and so beat Emscripten's libc members of the same names
without an export list; it also makes every such name collide with a
program's own, and `abort` is the first a program defines. The probe shows
an ordinarily linked archive before `-lc-ww` wins by order too (lld keeps
the first lazy definition), so the whole archive may only be covering
unreferenced definitions, such as the ones a DSO host exports. Dropping it
is a link-model decision for the owner, with the DSO provider list
(`--export-if-defined`) measured first.

Also found: the repins of 00:29 (90ca88ca) hashed stale staged copies in
`dist/static/default/commands/` (no staging after merging 0f6324fc), so
161 recipes carried the earlier commands' pins; the builder repins the
working tree at its start, which is why the round built them. Committed as
6ce4f9dc. The abort change itself moves no pin: the archive is an image
input (`af3cb5ea…`), not a pinned source.

Tests: `process-browser.mjs` builds an `abort` of the program's own into an
archive and links a program against it (exit 7 proves the program's ran);
`threads-browser.mjs` ends a `-pthread` program's `abort` by SIGABRT (134).
On `default,system` built from this seed (16 min at one job): `process`
passes in Chromium (41.5 s) and Firefox (41.6 s), e0c73f1c's SIGABRT cases
with it; `threads` passes in both (10.7 s, 12.6 s). The link that failed,
ahead of the 58-image closure: `/opt/mozjs` taken out of the older seed's
`spidermonkey` snapshot (`decodeSystemSnapshot`, 330 files) into the new
`system` image, then the recipe's line `c++ -std=c++20 -O1
-I/opt/mozjs/include spidermonkey-check.cpp -L/opt/mozjs/lib -ljs_static
-ljsrust -lz` links in 3.0 s and the check prints "wasm64 realms, GC,
callbacks and clone passed", in Chromium and Firefox
(`build/abort-evidence/sm-link-browser.{mjs,log}`).

## Lessons

- Most of the defects are code from the first checkpoint (`b95459ce`,
  2026-09-05) written before the mechanism it stood in for existed, and not
  looked at when the mechanism came: `getpass` before termios had ECHO,
  `system` before handlers ran in Wasm, the `getppid` cache before children
  outlived parents, EXIT's signal override before libc took signals, the
  signal-before-start rule before exec carried signal state. When a
  mechanism lands, grep for what compensated for its absence.
- One program run natively and in Dolly, diffing one line per edge case
  (`probes/posix-edges.c`, `probes/process-edges.c`), found nine defects in
  an hour that the browser suites, written from Dolly's side, never asked
  about. `process-descriptors.c` already compiles natively under
  sanitizers: checks put there prove Linux agrees.
- Errno probes find wrong answers; the quiet defects were in state a call
  leaves for another program to read: a modification time after
  truncation (make), a line speed (Emacs), a file type and position (Python,
  `test -c`). The later comparisons asked what make, git and Emacs read,
  and each found one.
- A rule decided in two places drifts: the kernel learned what exec carries
  across, the supervisor kept ending any process not yet started. One
  decider (the kernel), and the other side asks.
- Before deleting a Dolly copy of a libc function, look at what Emscripten
  builds of musl (`tools/system_libs.py`): `getpass` was there because
  Emscripten leaves it out, not because musl's was wrong. The first image
  round found it at git's link, 9 minutes in.
- A flaky failure blamed on the obvious suspect can be another bug: the
  supervisor's 500 ms grace looked guilty of a death under a flood of
  signals; a log line per exit showed EXIT's override. Instrument before
  fixing.
- Kernel C iterates in 14 s; one libc line costs a `default,system` round
  of 20 min (more while three agents share three build slots), and a seed
  header (`runtime.h`) rewrites the pins of all 186 recipes. Batch libc
  fixes. On this shared machine one call measured 8-25 µs from run to run:
  page-side savings under ~20% cannot be shown, so two were dropped.
- A whole-archive link makes member boundaries meaningless: 129d9fe1 fixed
  the symptom by the libc rule ("each function its own member") without
  reading the link line that consumes the archive. Read how an archive is
  linked before reasoning about its members.
- A fix for a failed image is verified by the link that failed, not by the
  theory: `wasm-ld --trace-symbol=abort` on `build_process`'s line, in the
  seed container, answered in a minute which definition each case takes,
  while the image that failed sits behind a 59-image closure.
- The same source compiled into two archives (`build.sh`,
  `build-process-threads.sh`) drifts the moment one gains a file: the
  threaded libc lost `abort` for a night. One source file per libc function
  group, both builds compile the same list, or the list is shared.
- A repin hashes the staged copies in `dist/static/`, not the sources:
  after a merge, stage (`npm run image`) before `update-recipe-pins.mjs`, or
  the pins are the previous commit's bytes and only the builder's own repin
  at start hides it.
