# Expected outputs as data: cases a second host runs without JavaScript

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: donna,tests,testing,0.1.6

Requested from Donna, the native Rust host of Dolly's userspace on wasmtime (`~/dev/donna`,
task `20261110-230235-dolly-requests` there; plan in `20261110-225114-native-host`). Donna runs
this repository's kernel, plugin, gate, programs and images unchanged and never forks a contract,
so what it needs changed is asked for here.

## State (2026-11-11)

Done on `fix/donna-data`, as data (`test/cases/README.md` gives the form):

| File | Read by | Cases |
| --- | --- | --- |
| `slop.json` | `slop-browser`, `slop.test` (Bash and ASan) | 209 shell cases and their files |
| `shell.json` | `shell-browser` | 59 steps: files, text tools, Git, ls, test, cc, limits |
| `toolchain.json` | `core-browser` | 64 steps: the compiler driver, archives, process, fs, pipe, poll, mmap probes |
| `process.json` | `process-browser` | 18 steps: lifecycle, descriptors, locks, signals, exec, Ninja |
| `cpp.json` | `cpp-browser` | 72 steps: the C++ SDK, Make, the driver's flags |
| `cpp-dso.json` | `dso-browser` | 4 steps: a C++ host and library share one runtime |
| `pty.json` | `pty-browser` | 12 steps in `system` with `pty@0` |

What stays in JavaScript is a fact of the page or of the test server: key presses (Ctrl+C,
C-g, resizes), Worker counts and timings, the HTTP policy and requests to the test server
(`network-browser`, curl and Git in `shell-browser`), host modules a page switches
(`nena-browser`, `amy-browser`), images built on the page (`shell-env-browser`, the refusal in
`pty-browser`), and memory and growth timings (`fs-growth`, `memory-growth`, `process-memory`,
`ending`).

## Why

Donna's rule: the same image gives the same output on both hosts; a difference is a bug in
Donna or in the contract. Dolly's userspace behaviour is asserted in JavaScript in
`test/*-browser.mjs` (process, shell, shell-env, pty, dso, cpp, core, network, amy, nena,
fs-growth, memory-growth, process-memory, ending). Donna contains no JavaScript, so it cannot
run them, and transcribing their assertions into Rust drifts the day either side changes.

## Wanted

- The cases that test Wasm userspace rather than the page, as data: image, command (argv or a
  Slop script), standard input, expected standard output, standard error where it matters,
  and status. One file per area under `test/cases/`, read by the existing browser tests (which
  then assert from the data) and by Donna.
- Or a test image whose ENTRY runs the cases inside Dolly and prints one result line per case,
  so a host only compares lines. This needs no data format, and the checks run where the
  behaviour lives.
- Either way, a case that is a browser fact (a page indicator, a CORS failure) stays in
  JavaScript.

## Done when

The userspace browser tests take their cases from the shared form, `npm run test:core` still
passes, and Donna's conformance task runs the same cases.

## Closed (2026-11-11)

Done: `a9012f37b`. On the 0.1.6 compiler round (`work/round-1111d.sh` to `round-1111i.sh`; seed and catalog pinned in `d1cb11dbc` and `6fdcad104`, image inputs `16a63999…`; logs in `build/round-1111-evidence/rerun*`) the
browser tests that read `test/cases/` (slop, shell, core, process, cpp, dso, pty) passed in
Chromium and Firefox, and `slop.test` in `npm run test:source`. Donna's
`20261110-230235-conformance` runs the same files.
