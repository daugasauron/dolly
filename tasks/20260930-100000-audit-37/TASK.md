# Janis Node API correctness bugs

- STATUS: OPEN
- PRIORITY: 210
- TAGS: bug,janis,demo

`fs.promises.rmdir` maps to `rmSync` and deletes files (`src/runtimes/janis.js:1055`);
`stream.pipeline`, `finished` and `stream/promises` resolve immediately (`:1677-1682`); a
relative `require` resolves to a directory (`:2287`); `performance.now()` returns epoch ms and
`structuredClone` is a JSON round-trip (`src/runtimes/dolly-node.js:851-852`); `execSync`
without encoding corrupts binary output (`janis.js:1371`, `1427`); package conditions put
`default` before `node` (`:1997`, `2209`); `fsCopy` reports every read failure as EPERM
(`src/runtimes/quickjs-main.c:813`).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Node-compatible behavior for the APIs Pi and tools use, or explicit errors.

## Done when

- Janis compatibility tests cover each case with Node's behavior as oracle.
