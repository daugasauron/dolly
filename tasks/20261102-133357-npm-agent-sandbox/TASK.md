# npm: a custom coding agent sandbox in minutes

- STATUS: OPEN
- PRIORITY: 300
- TAGS: npm,packages,pi

The owner, 2026-11-02 22:20 JST: "I also want to focus on making it easy to use and
customize the npm package as a user setting up a custom coding agent sandbox."

Someone who has never seen Dolly wants their own coding agent in a browser tab on their
page: Pi with their extensions, skills and instructions; the tools they want (git, python,
a compiler, their CLIs); their project's files in the workspace; their model provider and
how the key is entered; the hosts the agent may reach; their page's look.

Done when a stranger goes from the packed packages to a hosted agent that has all of the
above along one documented path, and `test/npm-browser.mjs` walks that path from packed
packages in Chromium and Firefox.

## The stranger's log, before (2026-11-02 22:36-22:48 JST)

From the packed tarballs (`scripts/package-npm.mjs`, a registry of their own) and the
docs at 71d2603fc, following the README's "Pi with npm" and "Your own Pi image" and
`docs/agent-frontend.md`. Evidence: `build/npm-sandbox-evidence/stranger-before*`.

| Step | Time | Friction |
| --- | --- | --- |
| `npm init`, `npm install` the six packages | 0 s | The install line names six packages; an image does not depend on its host modules |
| Copy `index.html` (30 lines) and `serve.mjs` (45 lines) from the README | 1 min | Two files to paste from the README |
| `npm install @daugasauron/dolly-build`, `npx dolly-build from pi-minimal my-pi` | 0 s | |
| Write the recipe's rows | 5 min | Pi's theme format and `settings.json`'s five keys are not in Dolly's docs: copied `demos/pi/dolly-theme.json` from the repository. Is `#!/usr/bin/janis` a shebang interpreter, is `/usr/local/bin` on `PATH`: not said; used `/usr/bin`. `/workspace` is never retained (`docs/dollyfile.md`), so the project cannot be a `FILE` row: it goes in `boot()`'s `files`, each file named on disk and again in the page. No git, no python: the npm packages hold only `default` and `pi-minimal`, and "Not there yet" sends the user to a checkout |
| `npx dolly-build Dollyfile-my-pi my-pi` | 9 s (third try) | Two body lines of my own without the four spaces: each failed with a 12-line Node stack trace around `Dollyfile-my-pi:39: unknown directive` |
| Page: policy of one rule, three workspace files fetched by name, popup colours | 2 min | The terminal's own colours have no knob (compiled into `src/ghostty/display.c`), only the popup's `--dolly-html-*`; a project of many files is a list in the page |
| Serve, boot in headless Chrome, check | 2 min | Pi starts with the theme, `AGENTS.md`, the skill, the extension, both tools (`#!/bin/slop` and `#!/usr/bin/janis` scripts run), the workspace, and `curl https://example.com` is refused (status 9). `git --version`, `python3 --version`: command not found |

Total: about 11 minutes with Dolly's internals known, two recipe retries, and no git or
python. The sandbox was the README's extension and skill, an `AGENTS.md`, `todo` (Slop)
and `jsonfmt` (Janis) tools, an `ocean` Pi theme with `settings.json`, an `init.slop`
starting Pi with `pi-key OPENROUTER_API_KEY --offline --provider openrouter`, a three-file
Python project, a one-rule policy and the popup colours.

## What changed and why (2026-11-02, branch `npm/agent-sandbox`)

Smallest first, as one user-facing surface: the recipe declares the sandbox, the page
declares what the browser gives it, `dolly-build` writes both and builds.

1. **`dolly-build` fails in one line.** Every error (a recipe row without its four spaces, a
   pin no package holds, a missing host module package) is `dolly-build: MESSAGE`, no stack.
   The parser's message already names the line; the stack hid it.
2. **Packages on npm: `@daugasauron/dolly-package-NAME`** for `git`, `python` and `cc`
   (`scripts/package-npm.mjs`): the same directory an image package has (catalog, the
   closure's metadata, packs, recipes) without `index.mjs`, since a package boots nothing.
   A package arrives with the packages its recipe `INSTALL`s (`python` brings `libffi` and
   `cc`): the first build of python's package failed with `snapshot returned HTTP 404` for a
   pack of `libffi`, since the language installs a package's rows first and the directory
   held only python's own packs. Sizes: git 3.4 MB, python 51 MB (with cc), cc 35 MB.
   Why packages rather than `amy` at run time: the page serves one image directory, and a
   booted image reads only its own packs; `INSTALL` at build time puts the tool in the image
   the page serves, and the recipe stays the one place that says what the sandbox holds.
3. **`dolly-build` resolves every `FROM`, `INSTALL`, `USE` and `COPY` row against the
   installed directories** (`dolly-image-*`, `dolly-package-*`), each at its own image's pin,
   merges their catalogs (the same image at another pin in two packages fails naming both),
   copies their metadata and recipes into the new directory and serves every holder's packs
   to the in-page build. A row no directory holds fails naming the row.
4. **`dolly-build init NAME [PACKAGE…]` replaces `from`.** It writes a project where the
   packages are installed: `Dollyfile-NAME` (`pi-minimal`'s and the packages' `REQUIRES HOST`
   rows, `FROM` and `INSTALL` at the installed pins, the template rows: `AGENTS.md`, a skill,
   an extension with `/hello`, a `todo` tool, a comment on themes, the start script with
   `pi-key OPENROUTER_API_KEY --offline --provider openrouter`, and `pi-minimal`'s `ENTRY`),
   `index.html` (the OpenRouter rule, the popup colours, the files of `workspace/` for
   `boot()`'s `files`), `serve.mjs` (isolation, a `/workspace/` listing, relays) and
   `workspace/README.md`, and a `.gitignore` (`node_modules/`, the image directory) unless
   the project has one. It refuses to write over a file, and names the host module package
   to install when the recipe declares one the page lacks (`python`'s `sockets`). Templates:
   `scripts/dolly-build-init/`, shipped in the package. Why a scaffold and not more docs:
   the README held 75 lines of page and server for the reader to paste, and the recipe's
   pins cannot be typed; `from` printed only the recipe. `init` is `from` plus the three
   files the README showed, so the README shrinks to one block of five commands and a
   table of what each file declares. No new `boot()` option: the workspace goes through
   `files`, listed by the project's own server.
5. **Docs**: README "Pi with npm" (five commands, the table), `docs/embedding.md` (the
   package table, "Your own image" around `init`), `docs/agent-frontend.md` (the recipe's
   rows instead of files beside the page; `init.slop` instead of `start.slop`).
6. **`test/npm-browser.mjs`** runs the README's block as written (install, `init my-pi git`,
   build with the browser under test), writes a file into `workspace/`, serves with the
   project's `serve.mjs`, boots: the key prompt, Pi with `changelog` and `hello.js`, `/hello`
   answers, the page's modules are exactly the recipe's `REQUIRES HOST` rows, and in the
   shell `AGENTS.md`, `todo`, `git --version`, the workspace file, and `curl https://example.com`
   refused. The `default` checks (devices, policy, files, lacking module, no isolation) stay.

## The stranger's log, after (2026-11-02 22:54-23:08 JST)

From the tarballs `package-npm.mjs` packs at 5def8d092, the same registry, following the
new README. Evidence: `build/npm-sandbox-evidence/stranger-after*`.

| Step | Time | Friction |
| --- | --- | --- |
| `npm init`, `npm install` of ten packages (the README's eight, `dolly-package-python`, `dolly-host-sockets`) | 1 s | One line to paste; python's host module is named in the README |
| `npx dolly-build init my-agent git python` | 0 s | Writes the four files; prints the two commands that follow |
| My own rows: a `jsonfmt` tool (Janis), the `ocean` theme and its `settings.json`; the project into `workspace/` | 1 min | The theme JSON (60 lines) and `settings.json`'s keys still come from the image or Pi's docs; the template only says where they go |
| `npx dolly-build Dollyfile-my-agent my-agent` | 30 s (9 s without python) | First run: `snapshot returned HTTP 404`, python's package lacked the packs of `libffi` and `cc` (fixed in `package-npm.mjs`, above). The output directory is 84 MB (61 packs): pi-minimal, git, python and cc in one image |
| Serve, boot in headless Chrome, check | boot 4.3 s | First run: Pi refused `--provider openrouter` without `--model`; the template now names `anthropic/claude-sonnet-4.5`, `/model` changes it. Then: Pi lists `changelog` and `hello.js`, `AGENTS.md`, the `ocean` theme, `/workspace` with the project, `todo` and `jsonfmt` run, `git version 2.55.0`, `Python 3.14.7`, `curl https://example.com` status 9, the page's modules are the recipe's nine. The browser logged a 404 for `/favicon.ico`; the template links an empty icon |

Total: about two minutes of commands and one of editing, one image rebuilt, git and
python in the sandbox. What the before run needed from Dolly's internals (the page and
server, the pins, where Pi's files go, that `/workspace` is written at boot, the start
script) is now written by `init` or said in its comments.

## Measured

- `test/npm-browser.mjs chromium` at 5def8d092: passed, 22.5 s of browser time, 156 s with
  packing and installing (`npm-browser-chromium-1.log`).
- `test/npm-browser.mjs firefox` at 5def8d092: passed, 23.9 s of browser time, 151 s in all
  (`npm-browser-firefox-1.log`).
- `test/npm-browser.mjs chromium firefox` after the template's icon and listing error and
  `init`'s note of a missing host module package: passed, 13.3 s and 16.7 s of browser time,
  157 s in all (`npm-browser-both-2.log`).
- `test/npm-browser.mjs chromium firefox` at the final command (`init` writes `.gitignore`):
  passed, 16.2 s and 20.5 s of browser time (`npm-browser-both-3.log`).
- `test/npm-browser.mjs chromium firefox` with a workspace file in a subdirectory with a space
  in its name (the page encodes each path segment): passed, 16.9 s and 20.3 s
  (`npm-browser-both-4.log`).
- Not measured tonight: `init` under pnpm and Yarn. This machine's pnpm 12.15 insists on
  fetching pnpm 12.16.1 from whatever registry `.npmrc` names, so it never installed from
  the test registry; `init` reads the same `node_modules/@daugasauron/` the build reads,
  which the earlier task measured under pnpm 12 and Yarn 1.
- `dolly-build`'s error paths by hand (`init` over existing files, a bad name, a package not
  installed, a body line without its spaces, a stale pin, a file that is no recipe, no
  arguments): one line each, naming the file and line or the command to run.
- Source suite 467 pass, `lint:dollyfiles` 193 recipes, before each commit.

## Frictions left

- Pi's theme: a 60-line JSON and a whole `settings.json`; the template names the files
  and Pi's `docs/themes.md`. The terminal's own palette is compiled into
  `src/ghostty/display.c` (a proposal below).
- Each project file is fetched by the page at boot; a large project is slow to boot.
  Fine for the small projects this is for.
- The install line names ten packages for a sandbox with python: an image does not
  depend on its host modules (the owner's design), and a package's host module
  (`sockets` for python) is the user's to add.
- `dolly-build` needs Chrome or a Playwright browser on the machine that builds.

## Proposals

- The terminal's palette (`src/ghostty/display.c`, a seed input) as a file the image
  holds or a configuration of `display@0`, so a page's look is complete: today the
  popups follow the page's CSS, the terminal does not.
- `pi-minimal`'s `init.slop` starts plain `pi`; with `OPENROUTER_API_KEY` alone Pi needs
  `--provider openrouter --model MODEL`. The README's old sentence ("`pi-key
  OPENROUTER_API_KEY --provider openrouter` ... `/model` picks a model") did not run:
  Pi refuses `--provider` without `--model`.
- Publishing `@daugasauron/dolly-package-git`, `-python` and `-cc` (3.4, 51 and 35 MB)
  is the owner's: `package-npm.mjs` packs them, the release checklist's npm step would
  publish them.

## Lessons

- A stopwatch and a stranger's seat found what reading the docs did not: Pi refuses
  `--provider` without `--model` (the README's sentence had not been run), a package's
  directory must carry the packs of what its recipe installs (`python` failed on `libffi`'s),
  a recipe typo died in a stack trace, and the page logged a 404 for a favicon on every load.
  Each is a line to fix; none shows up in a review of the design.
- Files that must be exact (pins, a server's isolation headers, a page's `boot()` call) are
  better written by a command than pasted from a README: "Pi with npm" went from 118 lines
  to 27 while covering more, and since the test runs what `init` wrote, the guide, the
  templates and the test cannot drift apart.
- The recipe language already held the answer to "the tools they want": `INSTALL` at build
  time, and the image directory format the catalog uses, made packages on npm a loop in
  `package-npm.mjs` and a lookup in `dolly-build.mjs`, with no change to the runtime, the
  kernel, the language or `boot()`.
- A check script is a product too: two of my runs failed on my own regex and on a handle the
  page did not expose. Dumping the screen on failure turned the third run into the finding.
