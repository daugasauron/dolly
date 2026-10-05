# Janis invites Node code that then fails: require, -e modules, Worker, stack traces

- STATUS: OPEN
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
