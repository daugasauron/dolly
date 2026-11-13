# A compiler that reads stdin and fails is retried on the consumed input and exits 0

- STATUS: DONE
- PRIORITY: 300
- TAGS: compiler,bug,process

Found by Donna (2026-11-12), on any host.

## State (2026-11-12)

Filed; the fix is in `src/process/runtime-adapter.c`, in the seed, so it goes with the next full
rebuild round.

## Repro

`c++ -x c++ -c -o /dev/null - < chain.cpp`, where `chain.cpp` is
`struct S { S &m() { return *this; } }; void f(S s) { s.m().m()… ; }` with 1,200 calls. The
first attempt traps ("out of bounds memory access", the 8 MiB C stack) and `runtime-adapter.c`
prints "compiler process failed; retrying 2/3"; the retry reads the standard input the first
attempt consumed, compiles nothing, and the command exits 0.

## Do

Retry only when every input can be read again: not when an input is `-` or standard input is not a
regular file; then the first failure is the result.

## Done when

The repro exits non-zero with the compiler's failure, in Chromium and Firefox, and a retry of a
file input still happens.

## Closed (2026-11-13)

On the 0.1.6 candidate round's images (main `e6ad7707c`), in Chromium and Firefox: the repro (1,200
chained calls on standard input) exits 126 with the compiler's failure and no retry; the same source
as a file is retried twice ("retrying" twice in its log), as before.
