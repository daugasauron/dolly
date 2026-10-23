# Janis: fs given a file URL object, and require of a directory, differ from Node

- STATUS: OPEN
- PRIORITY: 120
- TAGS: bug,javascript

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
