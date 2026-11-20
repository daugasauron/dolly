# A threaded program starts no thread where the browser cannot commit its whole memory maximum

- STATUS: CLOSED
- PRIORITY: 330
- TAGS: bug,threads,memory,photocraft,browser,0.1.8

## State (2026-11-20)

PhotoCraft, and any program linked with threads@0, failed its first `pthread_create` with EAGAIN
when the page's process could not commit the program's whole memory maximum (8 GiB by default).
Fixed on `fix/paste-devices` by the integrator's policy (below, "The fix").

## Seen

In the touch laptop of tasks/20261111-071600-paste-button-on-laptops: a KVM guest with 6 GB of
RAM, no swap and the kernel's default overcommit heuristic (`vm.overcommit_memory` 0), 4 vCPUs
(8 gave the same), Ubuntu 26.04, Google Chrome 158.0.8127.36 and Firefox 160.0.1 on X11.
RC1's `/v0.1.8/photocraft-photos/` (`282bc58c4`) printed, in both browsers, with WebGPU or
without:

    brush presets: Resource temporarily unavailable (os error 6)
    ... winit error: os error at .../src/platform_impl/dolly/window.rs:55: input thread:
    Resource temporarily unavailable (os error 6)
    PhotoCraft could not start ...

Chrome failed the same after `vm.overcommit_memory` was set to 1; Firefox was not retried so.
Evidence: `work/touch-lab/evidence/laptop-*-x11-webgpu/`, `work/touch-lab/shots/vm-photocraft*.png`.

## Reproduction (host, no VM)

Scripts in `work/touch-lab/scripts/`; RC1 on `127.0.0.1:9045`, headed on a private Xvfb (`:157`),
Chrome with the NVIDIA adapter (`--use-angle=vulkan`, GPU lock held).
- Not the cause: 4 CPUs (`taskset`, Chrome then reports `hardwareConcurrency` 4; Dolly reads no
  CPU count), a 6 GB memory cgroup without swap (`systemd-run --scope -p MemoryMax=6G
  -p MemorySwapMax=0`), Chrome 158 (Chrome for Testing 158.0.8127.36) or Chrome 156: PhotoCraft
  started in each (`photocraft-start.mjs`).
- The cause: a limit on what the browser may commit. Under `prlimit --data` (RLIMIT_DATA, which
  Chrome's sandbox sets on each renderer: 32 GiB here, with 60 GiB of RAM; tests run Chrome with
  `--no-sandbox`, so without it) PhotoCraft fails as in the VM:
  - Chrome 158: 6 GiB and 9 GiB fail, 12 GiB starts.
  - Firefox 160 (archive.mozilla.org): 6 GiB fails with the same two lines.
- Any threaded program: `test/thread-workers-browser.mjs chromium` passes unlimited (3000
  threads in 9.7 s) and fails under 6 GiB at its first `pthread_create`
  (`work/touch-lab/logs/thread-workers-*.log`).
- `grow-probe.mjs`: under 6 GiB a shared memory64 grows to 2 GiB, and a further one of 4, 6 or
  8 GiB is refused (`RangeError`, in Chrome "Unable to grow instance memory", in Firefox "failed
  to grow memory").

## The layer

`page/process-worker.mjs`, `reserveMaximum()`: at a threaded process's first thread spawn its
shared memory grows to the module's maximum at once (Chrome checks other threads' accesses
against a size record updated late, so the memory never grows while two threads run). When the
browser refuses that growth, the spawn returns `-EAGAIN` before threads@0, its quotas
(`host/threads/threads.mjs`: 64 Workers, 32 a process) or the kernel's table
(`host/threads/kernel.c`: 64 threads a process) are asked. The maximum is the program's
declared one: `programs/compiler.cpp` links with `--max-memory=8589934592`, and PhotoCraft's limit
lies between 9 and 12 GiB, its 8 GiB and the renderer's own data.

So a browser that cannot commit 8 GiB more for the page starts no thread: Chrome where its
sandbox's data limit for a renderer is lower (the VM's 6 GB), Firefox under the kernel's
heuristic overcommit where RAM and swap are less than that (the VM), and every threaded process
of a page shares its renderer's limit.

## Choices

Not small: the memory's maximum is fixed when the process's Worker makes it, and a threaded
memory must not grow while threads run.
- A lower maximum for threaded programs where the commit fails: the Worker could make the memory
  with a maximum below the declared one (a memory import accepts a smaller maximum) and take it
  at the first spawn, halving until the browser accepts; it cannot be learned before the first
  spawn without committing.
- A lower default `--max-memory` for programs linked with `-pthread` (an image rebuild).
- Committing at a process's start: every threaded process would hold its maximum, so a
  renderer's 32 GiB would hold three or four.

Done when a threaded program (PhotoCraft, `test/thread-workers-browser.mjs`) starts its threads
in Chrome and Firefox on a machine of 6 GB, or under `prlimit --data` of 6 GiB, and a browser
test covers it.

Seen alongside, not this task: tasks/20261120-092900-photocraft-safe-gpu-lease.

## The fix (2026-11-20)

The integrator's policy: a threaded program's memory (every process memory is shared, so the
rule follows `configuration.threaded`) is made at its declared maximum and grown to it as its
Worker starts; where the browser refuses (`RangeError`), that memory is dropped and one of half
the maximum is asked, down to the initial size, and the Worker's console says what was given.
The process then never grows, so a threaded memory still never grows while two threads run;
`reserveMaximum()` and its EAGAIN at a spawn are gone, and the spawn budget counts a threaded
process at its initial size (`page/process-worker.mjs`, `page/process-supervisor.mjs`,
`docs/process-model.md`). A single-threaded program's memory grows as before.
`test/thread-workers-browser.mjs` runs itself once more under `prlimit --data` of 6 GiB on Linux.

## Closed (2026-11-20)

On `fix/paste-devices`, on this host, Xvfb `:157`, the GPU lock held per run (Chrome 156, the
installed Firefox 159):
- `test/thread-workers-browser.mjs`: Chromium 3000 threads in 9.7 s, then 200 with 6 GiB of
  data; Firefox 3000 in 7.6 s, then 200. The 6 GiB case fails in both with the page before the
  fix (its first `pthread_create`).
- PhotoCraft (`photocraft-photos`, this tree served on 9058, WebGPU on the NVIDIA adapter) starts
  under `prlimit --data` of 6 GiB: Chrome with 2048 MiB ("the browser committed 2048 MiB of
  memory, not the 8192 MiB its program may use"), Firefox with 4096 MiB; and without a limit.
- `test/process-memory-browser.mjs` (resident memory: a committed page is not resident until
  touched) and `test/pointer-browser.mjs` (13 clicks each on gpu@0 and display@0) pass in both;
  `demos/godot/test/godot-flyover-browser.mjs` passes in Chrome and Firefox.
