# The javascript package becomes quickjs, janis and typescript

- STATUS: CLOSED
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

## Closed 2026-10-14

Branch `core/javascript-split` (worktree `work/js`, from main `50c698f8`),
commit `d8281852`. The done-when is met on the images built there:
`test/amy-browser.mjs` passes in Chromium and Firefox with a case for each
of the three ("Measured and tested"), no recipe is called `javascript`, and
the five recipes install `janis`.

For the integration tree, not parts of this task: sixteen recipes changed,
so `quickjs`, `janis`, `typescript`, `dolly-docs`, `pi-build`, `pi`,
`pi-runtime`, `pi-agent`, `pi-phone`, `closed-source-agent`, `bhop`,
`slopyard`, `classicube`, `rts-arena`, `pi-local` and `dollyfile-studio` are
rebuilt there; the last two were not built here. Not run here: Slopyard's
test (it needs a GPU window; the image was built, and it is the one program
that calls `dolly_quickjs_embed`), the tests of `local-llm` and `studio`
(`studio-browser.mjs` now reads `Dollyfile-quickjs`, where it read
`Dollyfile-typescript-build`), and the core suite (no kernel, page or host
module changed; no image input changed).

## What was built

The owner, the same night, as the integrator passed it on: "reusable, good,
no shortcuts, packages", with the example of taking what a build image makes
for itself and making it a package of its own. So the three are not views of `typescript-build`: each
recipe is `FROM system-tools` and holds its build, and each installs the one
before by reference.

| Package | Recipe installs | Builds | Keeps | Snapshot |
| --- | --- | --- | --- | --- |
| `quickjs` | nothing | upstream's engine and upstream's `qjs` from the pinned checkout, as its `CMakeLists.txt` does (`qjs.c`, `quickjs-libc.c`, `gen/repl.c`, `gen/standalone.c` on the engine) | `qjs`, `libquickjs.a`, `quickjs.h`, `qjs.1`, the licence | 2,990,220 |
| `janis` | `quickjs` | Dolly's runner (`quickjs-main.c`) against the installed header, `janis` linked `-ldolly-js -lquickjs` | `janis`, `libdolly-js.a`, `dolly/quickjs-runner.h`, `/usr/lib/dolly/node.js`, `/usr/lib/janis/runtime.js`, `janis.1` | 1,780,428 |
| `typescript` | `janis` | `tsc` (the runner started on the archive's compiler) | `tsc`, `/usr/lib/typescript` (Microsoft's npm archive, unchanged), `tsc.1` | 25,121,698 |

Together 29,892,346 bytes against the 28,240,268 of `javascript`: 1,652,078
more. By file (the snapshots decoded): upstream's `qjs` is 1,416,688 where
there was a link to `janis`; each package keeps its own record and recipe
chain under `/etc/dolly` (349,168 for the three, 123,466 before); the three
manual pages are 7,998. `janis` (1,352,733) and `tsc` (1,352,781) are the
size they were, and `libquickjs.a` (1,397,894) with `libdolly-js.a` (144,618)
is the size of the one archive before (1,542,482). Of the old 28 MB,
TypeScript's folder was 23,625,704 and `tsc` 1,352,781: 88%.

They build in 14.9 s, 4.1 s and 5.2 s (28 s for the command that builds the
three). `typescript-build` held nothing that is no package's: nothing is
left of it.

Measured before writing the recipe (Chromium, a session of `system` and the
old `javascript`): upstream's `qjs.c` and `quickjs-libc.c` compile and link
unchanged with the flags the engine already had. `qjs -e` evaluates, and
`process`, `require` and `Dolly` are undefined in it; `--std` gives
upstream's `std` and `os` over Dolly's files; `std.popen` works; `os.exec`
throws `fork error` (nothing forks here); `os.platform` is `js`, upstream's
name for a build with `EMSCRIPTEN`, its switch for a target without threads
(no `os.Worker`). On the built package: its prompt works at the terminal
and Ctrl+D ends it with 0; Ctrl+C ends a bytecode loop with 130.

Decisions:

- **The runner's archive and header are in `janis`.** `libdolly-js.a` and
  `dolly/quickjs-runner.h` have six consumers (`tsc`, `pi`, the agents of
  bhop, classicube and rts, Slopyard, which also includes `quickjs.h`). A
  program linked with the archive reads Janis's two scripts when it starts,
  so the archive without `janis` is of no use; and `janis` installs
  `quickjs`, so whoever installs `janis` can link `-ldolly-js -lquickjs`.
  The archive now holds the runner alone: those link lines name the engine's
  library too. Names unchanged: a rename would touch the six and change no
  behaviour.
- **A recipe installs the highest of the three it uses**; the packages' own
  rows bring the rest, and `REQUIRES` rows assert each object a recipe names.
  `pi-build` installs `typescript` (it runs `tsc` and `janis` and links the
  runner). `pi` installs `janis`: `/usr/bin/pi` is the runner and reads
  `/usr/lib/dolly/node.js` and `/usr/lib/janis/runtime.js`, and Pi's skill
  offers the agent `janis`; nothing of Pi starts `tsc` or loads TypeScript's
  folder (grep of Pi's source and of `demos/pi`; its twelve runs pass
  without them), and the skill now says `amy install typescript`.
  `pi-runtime` installs `janis`: classicube and rts-arena, built on it, link
  the runner. `bhop` and `slopyard` install `janis` (they link the runner).
  `closed-source-agent` installs `janis` (its launcher runs `janis cli.js`).
- **`qjs` is no longer Janis.** The runner's messages and usage say `janis`
  (they said `qjs`), and the tests that used `qjs` for Dolly's surface use
  `janis`.
- **Manual pages**: each command's `--help` as `cat1` (`qjs --help` ends
  with status 1, upstream's choice).
- **Docs**: `docs/dollyfile.md` and `docs/architecture.md` named the package;
  they say `janis` now, which repins `dolly-docs` (and `pi-agent`, rebuilt
  anyway). No seed change: no image input was touched.

## Measured and tested

Sizes, bytes of snapshot, before (main `50c698f8`) and after:

| Image | Before | After |
| --- | --- | --- |
| `javascript` / the three | 28,240,268 | 29,892,346 |
| `pi-build` (now on `system-tools` and `typescript`) | 241,206,708 | 242,635,316 |
| `pi` | 62,341,217 | 62,342,829 |
| `pi-runtime` | 252,688,084 | 229,110,651 |
| `pi-agent` | 252,934,329 | 229,356,877 |
| `closed-source-agent` | 185,252,762 | 161,671,823 |
| `pi-phone` | 391,945,220 | 368,367,792 |
| `bhop` | 280,774,407 | 257,197,083 |
| `slopyard` | 280,960,784 | 257,383,444 |
| `classicube` | 260,574,772 | 236,997,437 |
| `rts-arena` | 378,662,156 | 355,084,837 |

What `pi` brings with it (its own snapshot and those of the rows it
installs): before `pi`, `javascript`, `ripgrep` (6,121,927) and `fd`
(5,575,169), 102,278,581 bytes; after `pi`, `quickjs`, `janis`, `ripgrep`
and `fd`, 78,810,573 bytes: 23,468,008 less, TypeScript's folder and `tsc`.
Of the 4.8 MB that are QuickJS's and Janis's, Pi uses Janis's two scripts
(`pi` is itself the runner); `qjs`, `janis` and the libraries are there for
the agent and for programs built in the session.

Every image that held `javascript` and now holds `janis` is 23.6 MB smaller.

Builds here (`work/js`, one job): the three packages 28 s; `dolly-docs`,
`pi-build` (78 s), `pi`, `pi-runtime`, `pi-agent` and `closed-source-agent`
3 min 45 s with staging; `bhop`, `slopyard`, `classicube`, `rts-arena` and
`pi-phone` 4 min 11 s. The Rust chain's sources, which staging reads even
when `ripgrep` and `fd` are cache hits, were read through links to
`work/rust/build/rustc-port`.

Tests on those images:

- `node --test 'test/*.test.mjs' 'demos/**/*.test.mjs'`: 429 pass.
- `node test/amy-browser.mjs`: every case passes in Chromium and Firefox
  (4 min 10 s for both), on a catalog of 103 images (69 packages: `default`,
  `system`, what its cases install and the images above): the fourteen
  built here and main's, unchanged. The three's cases: in a session without
  a compiler, `qjs` is absent, `amy install quickjs` (0.1 to 0.3 s) brings
  it, it evaluates and cannot import `node:fs`, and `janis` is still absent;
  `amy install janis` (0.1 to 0.2 s) brings `janis`, which reads a file with
  `node:fs` and starts a child, and `tsc` is still absent; in a fresh
  `default`, `amy install typescript` (0.5 s) brings `tsc`, which compiles a file that `janis` then
  runs, and `amy list` shows `janis` and `quickjs` installed; in a session
  with `cc`, a C program evaluates an expression with `-lquickjs` and
  `quickjs.h`, and after `amy install janis` a C program that is one script
  links `-ldolly-js -lquickjs` and reads a file.
- `npm run test:demos -- javascript`: passes, Chromium 29.1 s (it runs
  Chromium only), in a session of `system` that installs `typescript`: `qjs`
  as above with its prompt at the terminal and Ctrl+C in a loop, then the
  cases Janis had, with `janis` where they said `qjs`.
- `node demos/pi/test/pi-browser.mjs`: 12 of 12 pass, two at a time,
  Chromium, 48.6 s to 61.1 s.
- `npm run test:demos -- closed-source-agent`: passes, Chromium 41.6 s.
- `npm run test:demos -- bhop`, `classicube`, `rts`, `speech` (which opens
  `pi-phone`): pass, Chromium, 206.7 s, 321.3 s, 370.7 s and 49 s.

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
