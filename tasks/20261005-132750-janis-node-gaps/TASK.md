# Janis invites Node code that then fails: require, -e modules, Worker, stack traces

- STATUS: CLOSED
- PRIORITY: 220
- TAGS: javascript,janis,demo

An agent inside the deployed `pi` image (`~/Downloads/AUDIT-sandbox-painpoints.md`
§8, `AUDIT-session-latency.md` §3.3):

- `process.version` is `v22.19.0-janis`, yet `require` is not defined, in `-e`
  or in files.
- `import` works only in `.mjs` files: `janis -e 'import fs from "node:fs"'`
  and `await import(...)` in `-e` are syntax errors.
- `Worker` is exported and throws when constructed.
- Stack traces point into `/usr/lib/janis/runtime.js`, not the user's file.
- The QuickJS heap stops near 510 MB with `out of memory`.
- A `/tmp/janis-*` directory outlives its run.

AGENTS.md asks for a practical Node-compatible runtime that reports unsupported
capabilities accurately. Each item is fixed or fails with a line that says what
is unsupported; an export that cannot work is not exported.

## Done when

- Each case above is in the Node-oracle comparison (`demos/javascript/test/`)
  with the decided behaviour, and the `javascript` and `pi` demo tests pass.

## Decisions and evidence (2026-10-05, branch `work/claude-code`)

Reproduced first with a native host build of the unchanged sources (scratch
only) and the `typescript-build` image in Chromium.

- `require`, `import` in `.js`, `-e` imports: Janis now decides an entry's
  format as Node 22 does. Files, `-e` (`[eval]`) and stdin (`[stdin]`) run as
  CommonJS with `require`, `module`, `exports`, `__filename`, `__dirname` and
  `require.main`, unless `.mjs`, the nearest package `type` or ESM-only syntax
  (detected by a failed CommonJS parse) makes them ESM. CommonJS is compiled by
  Node's wrapper under its own filename (`Dolly.compileCommonJs`), so frames
  name the right file and line (before: `<input>:4` for line 2, as
  `Function()` bodies). Oracle: `entry`.
- `Worker`: kept as a named export, construction fails with `ENOSYS`.
  Removing it was tried and measured: Pi imports `Worker` statically for its
  codemode tool and failed to link (`Could not find export 'Worker' in module
  'node:worker_threads'`, pi-build 2026-10-05 23:08). An ESM named import that
  is absent fails the whole program, so the export stays. Unit test in
  `janis-compatibility.test.mjs`.
- Stack traces: `error.stack` starts with the `Name: message` line as in V8
  (a JS `Error.prepareStackTrace`, 6.6 versus 2.9 µs per ten-frame error
  natively); runtime frames read `node:internal/janis` and `node:internal/dolly`,
  the names Node's own internals use and stack filters skip; errno errors are
  built through the `Error` constructor with Node's message, e.g. `ENOENT: no
  such file or directory, open '/x'` (libuv's descriptions), plus `path` and
  `dest`. Oracle: `errors`.
- Heap: not reproducible on `integrate/1005`. In Chromium, Janis kept 8176 MiB
  of 16 MiB typed arrays, and of 16 MiB strings, before `out of memory`, the
  process's 8 GiB memory; one typed array stops between 1 and 2 GiB
  (QuickJS-ng's 2^31-1 index limit). QuickJS-ng sets no heap limit
  (`malloc_limit` 0). The browser test now keeps 768 MiB.
- `/tmp/janis-*`: the ESM views of built-in and CommonJS modules are generated
  in memory (`__janisModuleSource`), so no directory is created at all. The
  browser test checks `/tmp` after the oracle.
- Found on the way, all in the oracle: unhandled rejections were dropped
  silently and `uncaughtException` listeners never ran (Janis set no QuickJS
  rejection tracker); `process.exitCode` started as `0`, not `undefined`
  (Claude Code read that as "shutting down"); `events.once` was not a named
  export; `fs` lacked symlink, link, readlink, truncate and fsync.

Verified 2026-10-06 00:10 on `work/claude-code` (commits `9ca11f65`..`024e246a`),
`javascript` and `pi` images rebuilt from it: `npm run test:demos -- javascript
pi` passed (javascript 35.8 s with 26 Node-oracle groups, pi 78.7 s),
`node test/core-browser.mjs chromium` passed, `npm run test:source` 334/334.
Each case above is in `demos/javascript/test/` (oracle groups `entry`,
`errors`, `uncaught`, `exit`; `Worker` in `janis-compatibility.test.mjs`;
heap and `/tmp` in `javascript-browser.mjs`).

Not done, measured: `console.log` of an object prints `[object Object]`
(Node prints `util.inspect`), and `util.inspect` is JSON-shaped; `require` of
an ES module fails with `ERR_REQUIRE_ESM` where Node 22.12+ loads it;
`Readable.call(this)` on Janis's class-based streams fails.
