# The spawn budget and a threaded process's memory: measure before a contract change

- STATUS: OPEN
- PRIORITY: 100
- TAGS: core,memory,threads,processes,investigation

Since a process's memory takes its maximum before its second thread starts
(`tasks/20261030-090000-chrome-grown-memory`, 2026-11-01), the spawn budget reads the size a
Worker reports with each call and ignores a threaded process's reports at its maximum, keeping the
size it had before the reservation. What such a process allocates after its second thread starts
is invisible to the budget: `lake build -j4` of four `lean`, each importing 1.7 GB, is not held
back as four unthreaded processes of that size would be. Counting at the maximum would hold every
fan-out of a threaded parent (cargo's rustc) to one child. What would let the budget see it is the
libc adapter reporting its break to the kernel when `sbrk` moves past it: a process contract change.

Decided 2026-11-04 (`tasks/20261102-133353-owner-decisions`): no failure from the blindness is
measured, so measure first. In a 6 GB slot (`work/slot.sh`), Chromium and Firefox: `lake build -j4`
of a Lean project of four modules in `default` after `amy install lean`, and `cargo build -j4` of a
crate with four dependencies in `rust-tools`; record whether the tab dies or a spawn is refused, and
the anonymous memory at the peak, against the same at `-j1`. If the tab dies where the budget would
have refused an unthreaded spawn of that size, the adapter reports its break (one operation, or a
word of the call packet), a seed round, with a test that fails before (a threaded program that grows
past the budget is refused a spawn). If both pass, or the budget refuses in time, close on the
numbers and change nothing.

Done when: the table is in this task, and either the contract change is in a round with its test
or the task is closed on the numbers.
