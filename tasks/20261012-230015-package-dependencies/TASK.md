# A package names its dependencies: amy installs the INSTALL rows of its recipe

- STATUS: OPEN
- PRIORITY: 330
- TAGS: packages,amy,core

Owner (2026-10-13): "Reflect on how the package dependencies could work with
amy, I guess it could work out of the box by just parsing the Dollyfiles?
They already specify requires etc? No need for new syntax to manage it?"

Done when: the answer is here with what was measured, and either a package's
snapshot holds its own files while `amy install` installs the `INSTALL` rows
of its recipe first (tested in both browsers, sizes before and after), or
the task says exactly what stops it.

## The answer

Yes: no new syntax, and nothing has to parse a Dollyfile at install time.

- **The dependencies are the `INSTALL` rows.** They carry the pin, so nothing
  is resolved and no solver chooses: 14 of the catalog's 49 packages have
  them, 18 rows in all. The engine already wrote them down: a package's
  snapshot holds `/etc/dolly/installed`, the rows its recipe installed with
  those packages' own rows before them. That file is the parsed recipe.
- **What was missing is that a package also held the files.** `INSTALL` in a
  package's recipe copied the installed package into the package's own
  snapshot (`cargo` 500 MB, of which `rust` 463 MB, of which `cc` 126 MB).
  Now it keeps nothing of them: the files, environment and exports serve the
  build, and the record names the rows.
- **Whoever installs a package installs its rows first**, each from its own
  snapshot, and skips a row its own record holds. That is one rule in the
  engine for an image build (`INSTALL` in a recipe) and for a session
  (`dollyfile install`). A builder supplies the snapshots of the rows; in a
  session `amy` fetches them through `packages@0`, one at a time, and
  installs each as an install of its own (its own summary, its own file
  list).
- **`REQUIRES TOOL|LIB|HEADER` cannot be the dependencies**, measured: 13
  packages have such rows, 109 in all. 103 resolve to the toolchain the
  package is built `FROM`, 4 to the package's own exports, 2 to a package it
  installs (`gzip`: zlib's header and archive, which it links statically).
  They describe the build. Read as install-time needs they would bring the
  compiler into `zlib`, `curl`, `less` and `sdl2`, against the ruling that a
  library installs no compiler; and they carry no pin and name no package,
  so using them would need the catalog-wide solver the design refuses. What
  catches a missing row (a package that starts a program it does not
  install) is not a declaration but amy's test, which uses each package on a
  `default` that holds nothing else.

## How it works (branch `core/package-dependencies`)

- `src/dollyfile.c`, `load_artifact`: in a `PACKAGE` recipe `INSTALL` keeps
  nothing (files, exported objects, variables) and records the row. For any
  `INSTALL`, after the package's own checks (role, host modules, pin) and
  before a file changes, `install_rows` installs the rows of the package's
  record that `/etc/dolly/installed` lacks.
- A row whose snapshot is not there ends the install with status 3, nothing
  changed. A builder always supplies it. `amy` runs the engine first, so a
  package the image may not hold is refused before any row is installed;
  on 3 it installs the rows and asks again.
- `src/dollyfile-graph.mjs`: the `artifacts` of a recipe (what a build
  reads, and what an image's identity covers) include, before each
  `INSTALL`, the rows that package installs. Every builder reads that list:
  `npm run image`, `/IMAGE/rebuild/`, `/custom/`, the checkout server's
  freshness check.
- Unchanged: the recipe language, the artifact receipt, the record's format,
  the `packages@0` service (it serves any package of the release by pin),
  the index.

## What happens to

- **A package whose dependency moved its pin.** It cannot move alone: pins
  cascade, so the package's own pin moves with it, and one release's index
  and record are consistent. A session cannot mix releases either: the
  service answers 404 for a pin the tab's release does not publish (amy says
  to reload, and installs nothing), and a save loads only under the release
  that made it. By hand it can be done (`dollyfile install` with snapshots
  placed in `/etc/dolly/artifacts`), and the audit of 2026-10-13 found that a
  session then got two rows of one recipe and overwritten files, because the
  one-pin check of a build reads the recipe chain, which a session does not
  load. Now the record is checked too: an `INSTALL` of a recipe the record
  holds at another pin fails, naming it, as the document already said.
- **`amy remove`.** There is none. Before, it could not have been written:
  `zig`'s file list held `cc`. Now `/etc/dolly/files/NAME` is the package's
  own files, and the records say who names whom (each installed package's
  recipe is in `/etc/dolly/recipes`). Not built: nobody asked for it.
- **A saved session.** Nothing new: installed files and the record are
  session files as before. Tested: the rows installed for a package are
  there after a save and a reload.
- **A refusal.** `amy install transcribe` on `default` is refused for
  `microphone@0` before `parakeet`, which it names, is fetched.

## Measured (2026-10-13, this tree, the chain rebuilt on the changed seed)

Snapshot bytes, before on main's seed and after:

| Package | Its rows | Before | After |
| --- | --- | ---: | ---: |
| `gzip` | `zlib` | 508,918 | 279,954 |
| `zig` | `cc` | 186,887,937 | 60,778,163 |
| `python`, with the held rows | `cc`, `ninja` | 173,588,803 | 47,325,381 |
| `cc`, `ninja`, `make` (no rows) | | 126,284,177; 387,072; 595,184 | the same |

`amy install` on `default`, from the local checkout server:

| | Before | After |
| --- | --- | --- |
| `zig`, no compiler in the session | one snapshot of 187 MB: 1.8 s Chromium, 2.2 s Firefox | `cc`, then `zig`: 2.2 s Chromium |
| `python`, `cc` in the session | 173 MB again, `cc` restored a second time | `ninja` and `python`: 1.0 s |

What amy prints for `amy install zig`:

```text
amy: fetching zig
dollyfile: /v0.1.2/Dollyfile-zig installs /v0.1.2/Dollyfile-cc first
amy: fetching cc
dollyfile: INSTALL /v0.1.2/Dollyfile-cc (2056 paths)
dollyfile: INSTALL /v0.1.2/Dollyfile-zig (1450 paths)
amy: cc installed: 1951 files, 125907943 bytes, commands: ar c++ cc ld make; amy files cc lists them
amy: zig installed: 1333 files, 60452098 bytes, commands: zig; amy files zig lists them
```

Tests on that chain:

- `test/default-browser.mjs`, Chromium and Firefox: "composed dependency" is
  new. The page builds an image whose recipe installs `zig` alone: it holds
  `cc` too, recorded before `zig`, and compiles a C program.
- `npm run test:demos -- python`: `python` (a `system` image built in the
  page with `INSTALL python`: `cc` and `ninja` come from their own
  snapshots) 29.1 s; "python on default" (`amy install python` alone, `cc`
  absent before, then `pip install numpy` from the sdist) Chromium 181.3 s,
  Firefox 217.8 s.
- `npm run test:demos -- javascript`: passes, Chromium 25.0 s.

The chain, one image at a time: `system-build` to `default` in 12 min 5 s
of builds (`system-build` 63 s, `zig-build` 7 min 22 s, `ghostty-build`
65 s, `system-tools` 116 s, the eight packages and `default` 39 s). With
`cc`, `make`, `ninja`, `zig`, `system`, `python` (148 s), `javascript`,
`git`, `less`, `raylib`, `box3d` and `dolly-docs`: 17 min 21 s.

## Not done, and why

- `rust`, `cargo`, `ripgrep`, `fd`, `codex-cli`, `pi-coding-agent`, `llvm`,
  `cmake`'s neighbours and the models were not rebuilt here: their sizes
  after are what their own files weigh today (the table), their installs are
  the same code path as `zig` and `python`.
- `pi-coding-agent` exports `rg` and `fd`, which `ripgrep` and `fd` hold: it
  keeps a second copy of the two programs (12 MB). Dropping the two rows is
  a recipe edit for the next round.
