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

## State (2026-11-01 18:55 JST)

Read: the whole of the scope above. Baseline: build reproducible (same runtime
and image ids), source suite 446/446 in 27 s, `process-browser` passes in
Chromium (58 s). Items 1-17 are committed and verified on `default,system`
built from the new seed (image inputs `5a218e03…`; the first round of it
failed at git's link, item 7): `process`, `terminal`, `core`, `pty`,
`threads`, `slop` and `shell` pass in Chromium and Firefox. The libc items
need a catalog round. Next: the cost of a system call on the page's side.

## Fixed

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
   SIGHUP, reports it on a pipe and execs, and sends SIGHUP every 2 ms until it
   ends; before, `EXEC hangup ended by 1` (Chromium), now status 46. Kernel C
   and page JavaScript only: image inputs unchanged.
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
    no hard links, whole-mapping `munmap`, no FIFOs, a 64 KiB page) and two
    small ones left: `futimens` of a pipe fails with ESPIPE, and `nice(0)`
    fails with EPERM (Emscripten's `setpriority` refuses even the priority
    a process has, the only one there is: a libc line for a seed round).

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

## Proposals for the owner

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

- **Every system call costs 23-25 µs in Chromium and 31-35 µs in Firefox**
  (20,000 `fcntl(F_GETFD)`, `-O2`, `system` image): a postMessage, the
  runtime Worker's event loop and an Atomics wait. Writes go in 16 KiB
  packets (`DOLLY_PROCESS_IO_CHUNK`, since `b95459ce`) while reads take
  1 MiB: 64 MiB written in 1 MiB calls take 0.12-0.16 s (410-550 MiB/s),
  read back in 0.010-0.026 s. A 64 KiB write packet (the pipe's capacity)
  would make bulk file writes about 4x cheaper without copying more than a
  pipe takes on each retry of a blocked write; it is a seed change for a gain
  no measured workload has shown yet (a 78 MB link output is ~0.14 s of
  calls), so it is left.
- Of those 23-25 µs the hop itself is the smaller part: a Worker's blocking
  round trip by `postMessage` and `Atomics.wait`, as `process-worker.mjs`
  makes it, takes 9.8 µs in Chrome, and 6.2 µs with `Atomics.waitAsync`
  in its place (20,000 round trips, `build/audit-kernel-evidence/bench`);
  the rest is the supervisor's and the kernel's work for each call. A
  protocol on `waitAsync` would save ~15% of a call, not enough for its
  complexity. (The same page hung in Firefox in the postMessage mode; not
  looked into, Dolly's own calls work there.)

## Lessons

- Four of the defects are code from the first checkpoint (`b95459ce`,
  2026-09-05) written before the mechanism it stood in for existed, and not
  looked at when the mechanism came: `getpass` before termios had ECHO,
  `system` before handlers ran in Wasm, the `getppid` cache before children
  outlived parents, the signal-before-start rule before exec carried signal
  state. When a mechanism lands, grep for what assumed its absence.
- A rule decided in two places drifts: the kernel learned what exec carries
  across, the supervisor kept ending any process not yet started. One
  decider (the kernel), and the other side asks.
- Before deleting a Dolly copy of a libc function, look at what Emscripten
  builds of musl (`tools/system_libs.py`): `getpass` was there because
  Emscripten leaves it out, not because musl's was wrong. The first image
  round found it at git's link, 9 minutes in.
- Kernel C iterates in 14 s; one libc line costs a `default,system` round
  of ~14 min, and a seed header (`runtime.h`) rewrites the pins of all 186
  recipes. Batch libc fixes, and keep header edits for rounds that change a
  header anyway.
