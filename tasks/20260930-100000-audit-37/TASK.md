# Janis Node API correctness bugs

- STATUS: CLOSED
- PRIORITY: 120
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

## Findings (2026-10-02, fix/janis on `ea1b32e`)

`42a3534` had fixed the reported cases and tested them against expectations written
by hand. Comparing with Node 22.22 showed remaining differences, now fixed in
`demos/javascript/`:

- `structuredClone` threw `TypeError` where Node throws `DOMException`
  `DataCloneError`; a top-level `Symbol` returned a broken exception value, and the
  `transfer` option was ignored. QuickJS's serializer is now `Dolly.cloneValue`
  (`quickjs-main.c`); `dolly-node.js` defines `structuredClone`, rejecting symbols and
  `transfer` and converting serializer refusals to `DataCloneError`.
- `copyFile` ignored its mode: `COPYFILE_EXCL` overwrote. The native `fsCopy` is
  deleted; `fsCopyFile` in `janis.js` copies through `open`/`read`/`write`, so errors
  are the real ones (`ENOENT`, `EISDIR`, `EEXIST`), out-of-range modes throw
  `ERR_OUT_OF_RANGE` and `COPYFILE_FICLONE_FORCE` fails with `ENOTSUP`.
- Streams: `finished` on an already ended or finished stream never settled; failed
  writes were dropped; `new Writable({ write })` and `new Transform({ transform,
  flush })` ignored their options (data passed through or was lost); `end(callback)`
  wrote the callback as a chunk. Streams now record `readableEnded`,
  `writableFinished` and `destroyed`, a write error destroys the stream, and
  `Transform` flushes before `finish`.
- `fs.rmdir(path, { recursive: true })` (deprecated in Node) failed with a misleading
  `ENOTEMPTY`; it now fails with `ENOSYS` naming the option and `fs.rm`.

## Evidence

`demos/javascript/test/fixtures/node-oracle.mjs` runs every case of both audit tasks
in Node on the host and in Janis inside Dolly; `javascript-browser.mjs` serves Node's
observations and requires identical results. A deliberately differing case
(`process.platform`) produced `NODE-ORACLE MISMATCH platform: Node "linux", Janis
"wasm"`, so the comparison is live. Results: `node demos/javascript/test/javascript-browser.mjs`
passed in Chrome (18.9 s) after rebuilding `typescript-build` and `javascript`;
with the Pi images rebuilt on the new Janis (`pi-build` compiles Pi with `tsc` on
it), `npm run test:demos -- javascript pi` passed (19.1 s and 72.2 s);
`npm run test:source` passed 332/332. Commit `5ecde91` on `fix/janis`.

