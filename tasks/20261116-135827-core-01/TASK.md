# A program without -pthread: trylock, timedwait, setcancelstate and barrier_wait claim what did not happen

- STATUS: OPEN
- PRIORITY: 240
- TAGS: audit,core,libc,0.1.8

From the core audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at `b09b1e243`).

## State (2026-11-17)

Fixed on `ws/seed` (process libc: a seed change, every image rebuilds), in
`process/pthread-stubs.c` over Emscripten's stub, as `pthread_cancel` was: a mutex records that it
is held in musl's own field (`_m_lock`; `_m_count` for a recursive one; `pthread_mutex_init` keeps
the attribute's kind), so `trylock` of a held one is `EBUSY`, a lock of it `EDEADLK` (the one
thread cannot release it), a timed lock `ETIMEDOUT` at the deadline, an unlock of an unheld
error-checking or recursive one `EPERM`; `pthread_cond_timedwait` sleeps to the deadline
(`ETIMEDOUT`; a handler that runs meanwhile is a spurious wake-up, 0) on the realtime clock, the
only one, since this libc's `pthread_condattr_setclock` is `ENOSYS`; `setcancelstate` and
`setcanceltype` keep and return the previous value; `pthread_barrier_init` of more than one is
`EAGAIN` and the wait of a barrier of one returns `PTHREAD_BARRIER_SERIAL_THREAD`. The same sweep
over the stub's other false successes: read-write locks count their readers (`trywrlock` of a held
one is `EBUSY`, a lock that would wait `EDEADLK` or `ETIMEDOUT`), and `pthread_kill` reports
`raise`'s error. Semaphores stay unsupported, explicitly (`sem_init` is `ENOSYS`).
`docs/process-model.md` says what a program without `-pthread` gets.

Checked on the rebuilt seed: the audit's `stubs.c` without `-pthread` now answers as the
`-pthread` column (`work/audit-1116-evidence/core/fix-seed/stubs-probe-chromium.log`: trylock 10,
timedwait 73 after 300 ms and 73 for a past deadline, old cancel state 0, barrier of 2: 6, EAGAIN),
and `process-browser`'s new case (`test/fixtures/process-serial-threads.c`) passes; see Done when.
For the round: a serial program that relocks a normal mutex now gets `EDEADLK` (a C++
`std::mutex::lock` throws) where it went on before; on Linux it would hang. None is known.

## Found

A program linked without `-pthread` gets Emscripten's `library_pthread_stub.c` (included by
`process/pthread-stubs.c:87`), which answers several calls with 0 although nothing happened.
`pthread-stubs.c` already overrides one of them for this reason (`pthread_cancel`, ENOTSUP, from
the kernel audit of 2026-11-01, item 6); the sweep then covered "what the probes hit" only.
AGENTS.md: "an unimplemented operation cannot return success"; "Report unsupported capabilities
accurately so upstream selects its fallbacks".

The same source (`work/audit-1116-evidence/core/probes/stubs.c`), compiled with `cc` in `system`
from `work/round1113/dist/` (`stubs-probe.mjs`, log `stubs-probe.log`), with and without `-pthread`:

| Call | Without `-pthread` | With `-pthread` (threads@0) | POSIX |
| --- | --- | --- | --- |
| `pthread_mutex_trylock` of a mutex the caller holds | 0 | 10 (EBUSY) | EBUSY |
| `pthread_cond_timedwait`, deadline 300 ms ahead | 0 after 0 ms | 73 (ETIMEDOUT) after 300 ms | ETIMEDOUT at the deadline |
| `pthread_cond_timedwait`, deadline 10 s past | 0 | 73 | ETIMEDOUT |
| `pthread_setcancelstate(DISABLE, &old)` | 0, `old` left unwritten (12345) | 0, `old` = 0 | writes the previous state |
| `pthread_barrier_wait` on a barrier of 2, one thread | 0 at once | blocks (correct; the probe skips it) | waits for the second thread |

What it costs, deduced from those answers (not run as such): a serial program that waits on a
condition with a deadline (`while (!ready && rc != ETIMEDOUT) rc = pthread_cond_timedwait(...)`)
would spin at full CPU forever instead of returning at the deadline; a trylock used to detect
re-entry never sees the lock held.
No program of the catalog is known to hit these today; a search of the ported sources for these
calls in serial builds was not made.

## Do

In `process/pthread-stubs.c`, as `pthread_cancel` is overridden there, define over the stub:
- a mutex that records it is held (`pthread_mutex_lock`/`trylock`/`unlock`, with the recursive
  and error-checking kinds musl's attributes give): `trylock` of a held normal mutex is EBUSY;
- `pthread_cond_timedwait` sleeps until the deadline (`clock_nanosleep` on the condition's clock)
  and returns ETIMEDOUT; `pthread_cond_wait`, which nothing can signal in one thread, stays a
  spurious wake-up (0), which POSIX allows;
- `pthread_setcancelstate`/`setcanceltype` write the previous value;
- `pthread_barrier_init` with a count above 1 fails with EAGAIN (no second thread can arrive).

## Done when

`stubs.c` built without `-pthread` in a rebuilt `system` answers as the `-pthread` column (the
barrier: EAGAIN at init), checked by a case in `process-browser` in Chromium and Firefox.
