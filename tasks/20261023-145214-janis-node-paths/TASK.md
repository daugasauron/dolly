# Janis: fs given a file URL object, and require of a directory, differ from Node

- STATUS: CLOSED
- PRIORITY: 120
- TAGS: bug,javascript,0.1.4

Found by `janis-install`'s browser test with ordinary npm packages
([janis-install](../20261023-114225-janis-install/TASK.md), step 2). Not fixed there: a
`janis.js` change repins the Janis chain (14 images), which that round avoids.

Reproduction, in a session with `janis` (Node 22 prints `{` and `ok` for both):

```sh
mkdir -p /tmp/p && echo '{"main": "main.js"}' > /tmp/p/package.json && echo 'module.exports = "ok"' > /tmp/p/main.js
echo 'import { readFileSync } from "node:fs"; console.log(readFileSync(new URL("file:///tmp/p/package.json"), "utf8")[0])' > /tmp/u.mjs && janis /tmp/u.mjs
janis -e 'console.log(require("/tmp/p"))'
```

- `fs` functions take a `URL` object as the string `file:///tmp/p/package.json` and fail
  with `ENOENT` naming it; Node converts a `file:` URL with `fileURLToPath`.
- `require` of an absolute or relative directory tries `index.js` only
  (`demos/javascript/janis.js:2778`, `janisModuleFile` at `:2499`); Node's LOAD_AS_DIRECTORY
  reads the directory's `package.json` `main` first. Bare specifiers already honour `main`.

Done when both behave as in Node, with `node-oracle.mjs` cases that fail before the fix.

## Fixed (2026-10-23, branch `demo/opus-audit-2`)

- `fs`: the operations that take a path convert a `file:` URL object with
  `fileURLToPath` (the first operand, and the second of `rename`, `copyFile`, `symlink` and
  `link`), in one table over `janisFs`'s synchronous functions, which the callback and
  promise forms call; `fs.promises.open` goes through it too.
- `require` of a relative or absolute path tries the file and its extensions, then the
  directory's `package.json` `main` (as a file, with `.js` or `.json`, or its `index.js`),
  then the directory's `index.js`, as Node's LOAD_AS_DIRECTORY does.
- `node-oracle.mjs`: `require("./main")` and `require(ROOT/require/main)` of a directory
  whose `main` is `lib/entry` beside an `index.js`, and `readFileSync`, `existsSync`,
  `statSync`, `fs.promises.readFile` and the callback `readFile` of a URL object. On the old
  Janis (`build/opus-evidence/r2-janis-before.log`, Chromium): `require` gave
  `["...","index","index"]` for Node's `"main","main"`, and every URL case `ENOENT` (`false`
  for `existsSync`). After: `demos/javascript/test/javascript-browser.mjs` passes in
  Chromium (29.9 s) and Firefox (48.9 s; a first Firefox launch died with SIGSEGV before
  any page, `r2-janis-after-firefox.log`). It repins the Janis chain; rebuilt here:
  `janis`, `typescript`, `pi-build`, `pi`, `pi-runtime`, `pi-agent`, whose
  `demos/pi/test/pi-browser.mjs` passes in both browsers on the new Janis.
