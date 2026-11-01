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

## State (2026-11-01 17:30 JST)

Read: the whole of the scope above. Baseline: build reproducible (same runtime
and image ids), source suite 446/446 in 27 s, `process-browser` passes in
Chromium (58 s).

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

## Findings, not changed

(filled as the night goes)

## Lessons

(at the end)
