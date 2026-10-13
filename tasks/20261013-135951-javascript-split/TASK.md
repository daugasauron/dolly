# The javascript package becomes quickjs, janis and typescript

- STATUS: OPEN
- PRIORITY: 230
- TAGS: packages,javascript,amy

Owner (2026-10-13): "the javascript package should be broken up into parts?
Quickjs is one, Typescript is one, and Janis (the Node ish filesystem
runtime) is one?", and on how the first two relate: "qjs is a library + tool
and janis can be something on top?"

Done when: `amy install quickjs` brings the engine as a library with its
header and a `qjs` command that is QuickJS and nothing more; `amy install
janis` brings the Node-like runtime, built on that library; `amy install
typescript` brings `tsc` and installs `janis`; no package is called
`javascript`; the recipes that installed it install what they use; each has
its check in `test/amy-browser.mjs`, in Chromium and Firefox.

## As filed (2026-10-13, main `37bbe23a`)

- `javascript` (28,240,268 bytes, `demos/javascript/Dollyfile-javascript`, a
  view of `typescript-build`) exports the tools `qjs`, `janis` and `tsc`, the
  library `libdolly-js.a` with `quickjs.h` and `dolly/quickjs-runner.h`, the
  folder `/usr/lib/typescript`, and `/usr/lib/dolly/node.js` and
  `/usr/lib/janis/runtime.js`.
- Today there is one program, not two: `janis` is `janis.c` linked with
  `-ldolly-js`, and `qjs` is a link to it ("qjs is the same program as
  janis", `Dollyfile-typescript-build`). `libdolly-js.a` holds the engine
  and Dolly's runner together (`quickjs-main.c`), so there is no QuickJS
  library or `qjs` without the Node-like surface.
- The owner's layering, which is the one to build: `quickjs` is upstream's
  engine as `libquickjs.a` with `quickjs.h` and upstream's own `qjs`;
  `janis` is Dolly's runner and its two scripts linked on that library;
  `typescript` is `tsc` and its folder, and installs `janis`. So the build
  splits the archive in two and compiles `qjs` from upstream's own source,
  where it links one archive and makes a link today.
- Who installs `javascript`: `pi`, `pi-runtime`, `bhop`, `slopyard` and
  `closed-source-agent`. None of their recipes names `tsc` or the TypeScript
  folder, so each would install `janis` alone; to check per recipe.
  How much of the 28 MB is TypeScript's is not measured.
- Since dependencies are by reference, `typescript` installing `janis` adds
  nothing to its snapshot.
- Cost: `typescript-build` again for the split archive and the new `qjs`,
  three thin packages over it, and the Pi images and the games that install
  Pi after them; no catalog round.
