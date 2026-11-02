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
   `boot()`'s `files`, listed by `workspace.json`, which `serve.mjs` answers and a static
   host holds as a file), `serve.mjs` (isolation, the listing, relays) and
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
- `test/npm-browser.mjs chromium firefox` with the listing at `workspace.json`: passed, 15.1 s
  and 17.4 s (`npm-browser-both-5.log`).
- Not measured tonight: `init` under pnpm and Yarn. This machine's pnpm 12.15 insists on
  fetching pnpm 12.16.1 from whatever registry `.npmrc` names, so it never installed from
  the test registry; `init` reads the same `node_modules/@daugasauron/` the build reads,
  which the earlier task measured under pnpm 12 and Yarn 1.
- `dolly-build`'s error paths by hand (`init` over existing files, a bad name, a package not
  installed, a body line without its spaces, a stale pin, a file that is no recipe, no
  arguments): one line each, naming the file and line or the command to run.
- Source suite 467 pass, `lint:dollyfiles` 193 recipes, before each commit.

## After the merge of integrate/2026-11-02 at 64491fd72 (2026-11-03 00:15 JST)

Merged cleanly (8c7cffcd5); `npm run build:runtime` kept the image inputs at fe5261db.
The branch repins `Dollyfile-dolly-docs` (the docs it holds changed), so `dolly-docs`,
`pi-dolly` and `pi-minimal` are "recipe changed" in `npm run image -- pi-minimal --plan`
and were rebuilt here before the final test (`image-after-merge.log`, 132 s for the three):
the npm packages pack `pi-minimal` from `dist/`, and a `FROM` at the recipe's pin needs the
built image to carry it. `default`, `git`, `python` and `cc` are unchanged. The plain
`npm run image` that followed, to make the catalog whole, was not seconds of cache hits:
the repin had changed twelve recipes (`bhop`, `classicube`, `dolly-docs`, `dollyfile-studio`,
`pi-agent`, `pi-dolly`, `pi-local`, `pi-minimal`, `pi-phone`, `pi-runtime`, `rts-arena`,
`slopyard`), and the Lean chain (`lean`, `lean-std`, `lean-meta`) was missing from the
evening round's catalog, so it built them all: 5792 s, exit 0, headless Chrome, and (my
mistake) outside the build slot. The catalog is whole again: 193 images, every pin the
recipe's, no hard link outside snapshots and packs. Then `test/npm-browser.mjs chromium
firefox` on the merged tree and the rebuilt `pi-minimal`: passed, 26.7 s and 34.4 s
(`npm-browser-both-6-after-merge.log`); source suite 467, lint 193.

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

## The second stranger's log, before (2026-11-03 03:00-03:10 JST)

The same way (tarballs of `package-npm.mjs` at 816021e9f, a registry of their own,
`build/npm-sandbox-evidence/stranger2/`), this time another provider, a real turn, the
user's own tools, the look, a project of 300 files, sessions and hosts. `install` of the
README's line with `dolly-package-cc` 1.2 s, `init my-agent git cc` 0.5 s, the build with
cc 23 s (69 MB, 49 packs), boot to Pi 5.8 s with 302 workspace files (`check-chromium-before.log`).

| Want | Found |
| --- | --- |
| Anthropic's API with my key | `agent-frontend.md` says Anthropic answers CORS and names no header: the rule needs `credentialHeaders: ["x-api-key"]` (Pi's Anthropic client sends the key in `x-api-key` and the `anthropic-dangerous-direct-browser-access` header Anthropic's CORS requires; both checked with a preflight and a 401 from Anthropic in the sandbox). Pi refuses `--provider` without `--model`, and Anthropic's model ids differ from OpenRouter's (`claude-sonnet-5-5` against `anthropic/claude-sonnet-5.5`) |
| A current model | The template named `anthropic/claude-sonnet-4.5` (2025). OpenRouter's public list (`/api/v1/models`, no key) has `anthropic/claude-sonnet-5.5` (2026-09-28) and `anthropic/claude-haiku-5.5` (2026-10-07); Pi 1.0.3's bundled catalog knows `anthropic/claude-sonnet-5.5` and `claude-sonnet-5-5`, not the Haiku 5.5 ids |
| A real turn | **The README's path could not complete one.** Pi 1.0.3 sends OpenRouter's `anthropic/*` models through Anthropic's Messages API (`https://openrouter.ai/api/v1/messages`) with the `anthropic-dangerous-direct-browser-access` header; OpenRouter's CORS preflight does not allow it (`Access-Control-Allow-Headers` lists the `X-Stainless-*` headers and not the `anthropic-*` ones). Pi shows `Error: Connection error.` three times and `Retry failed after 3 attempts` (`agent2.out`, the console's CORS errors). The first pass tested a fake key and never a request. OpenRouter's Chat Completions endpoint answers the preflight for everything Pi's OpenAI client sends |
| A C tool | The comment's `SLOP cc FILE -o /usr/bin/NAME` works at the first try: `count-lines` from a `FILE /tmp/count-lines.c` row prints `2 lines` |
| A file of an npm package | `SOURCE https://unpkg.com/pretty-bytes@6.1.1/index.js SHA256 /usr/lib/pretty-bytes.mjs` downloads at build time (the build admits each `SOURCE` URL), then `hr` failed: `could not load module '/usr/lib/pretty-bytes.mjs': No such file or directory`. `dollyfile.md` says downloads are not retained by themselves; a `FILE /usr/lib/pretty-bytes.mjs` row keeps it. The template's comment did not say so |
| Pi's colours | A 60-line theme: Pi's schema requires 51 of its 56 colour roles, so no theme is short. The template said where it goes and left the writing to the user |
| A host for the agent | One rule, `{ origin: "https://api.github.com", pathPrefix: "/", methods: ["GET"] }`: `curl https://api.github.com/zen` answers (GitHub, PyPI, OpenAI and Anthropic all answer CORS for a page origin). A refused host in Pi's `!` mode and its shell: `curl: (9) Browser HTTP policy denied the request`, clear. The provider's own host refused is not: Pi's clients say `Connection error.` |
| 300 files | Boot to the key prompt 3.2 s on localhost. The page fetched the files one after another: with 50 ms per request (a remote host) the loop takes 16.1 s for 302 files, concurrently 0.18 s (`fetch-timing.log`) |
| Sessions | No Save button: `pi-minimal` does not declare `snapshot@0`, and nothing in the project mentions it. On reload the agent's edits are gone: `/workspace` is written from `workspace/` at each boot, as the template's comment says |

## What changed and why (2026-11-03, the second pass)

1. **The template's provider lines.** `init.slop` starts Pi with `anthropic/claude-sonnet-5.5`;
   the next line, a comment, is Anthropic's API with the user's own key (`pi-key ANTHROPIC_API_KEY
   --offline --provider anthropic --model claude-sonnet-5-5`), and the page's policy has the
   matching rule as a comment under OpenRouter's (`x-api-key`). Switching is uncommenting one
   line in each file; the two files are two by design (the page holds what the browser admits,
   the recipe what runs). An OpenAI-compatible endpoint is `models.json` (`agent-frontend.md`,
   now with the `pi-key` line and the rule that go with it). No relay and no login anywhere.
2. **OpenRouter's Claude models through Chat Completions.** The template's recipe writes
   `models.json` with an `openrouter` entry (`baseUrl https://openrouter.ai/api/v1`, `api
   openai-completions`, `apiKey $OPENROUTER_API_KEY`, the default model's id). Pi then sends
   the default model through Chat Completions, whose preflight OpenRouter answers for the
   OpenAI client's headers. Measured on the built image: with the key file's key OpenRouter
   answers `401 {"message":"User not found."}` (the request arrived and was judged; that key
   is revoked, as `tasks/20261025-014414-npm-release` found on 2026-10-25), where the same
   start without the entry died in the preflight (`check-chromium-openrouter-realkey.log`,
   `agent2.out`). A Claude model picked with `/model` that the entry does not list goes the
   Messages way again: one more `id` in the row. No relay, no login, no change to the broker.
3. **`theme.json`.** `init` writes the image's Pi theme (name `dolly`, five `vars`, the 51 roles
   naming them) beside the page, and the page writes it over the image's theme at boot with the
   workspace. Editing colours is editing five values and reloading; `settings.json` stays the
   image's (`"theme": "dolly"`, `shellPath`). Chosen over a `FILE` row because a theme is 60
   lines whatever its source, a reload beats a rebuild for a colour, and `boot()`'s `files`
   already carries Pi's files; the recipe keeps a one-line pointer.
4. **The template's tool comment** names the three ways measured: a script, a C program (`FILE`
   with the source, `SLOP cc`), a file of an npm package (`SOURCE` from unpkg, then `FILE` to
   keep it). `EXPORTS TOOL` puts each on the agent's `PATH`. A package of the user's own in the
   `INSTALL` sense is not supported: `dolly-build` resolves rows against `node_modules/@daugasauron/`
   alone, so the way for the user's files is `SOURCE` by URL and digest.
5. **The page fetches the workspace concurrently** (`Promise.all`): 16.1 s to 0.18 s at 50 ms a
   request for 302 files, 0.30 to 0.10 s on localhost.
6. **README**: `cc` in the install line and `init my-pi git cc` (a C compiler is a coding
   sandbox's tool; the build takes 19 to 23 s with it), a row for `theme.json`, the provider
   sentence in the recipe's row. `embedding.md`: `init` writes `theme.json`. `agent-frontend.md`:
   the provider section with the lines and headers.
7. **`test/npm-browser.mjs`**: the user edits a colour of `theme.json` and appends the C tool's
   rows before the build; in the shell the theme file holds the colour and `count-lines`
   counts. The rest as before.

## The second stranger's log, after (2026-11-03 03:45-03:55 JST)

From the same tarballs with the new `dolly-build` templates in place of the installed ones
(`app-final/`), the README's block with `cc`: install 0.6 s, `init my-agent git cc` 0.4 s
(now `theme.json` too), my rows (the C tool, the unpkg library with its `FILE` row as the
comment now says, `REQUIRES HOST snapshot@0`), the GitHub rule, one colour in `theme.json`,
the 302-file project; build 22.4 s (69 MB, 49 packs). Boot to the key prompt 4.0 s in
Chromium and 4.9 s in Firefox, to Pi 6.5 s and 7.9 s; Pi's status bar shows
`anthropic/claude-sonnet-5.5`; `count-lines` prints `2 lines`, `hr 123456` prints `123 kB`,
`curl https://api.github.com/zen` answers and `curl https://example.com` is refused with
`curl: (9) Browser HTTP policy denied the request` in Pi's `!` mode and the shell; the
theme file holds my colour; the Save button is there, `saveSession("stranger")` saves in
0.8 s ("Saved stranger locally"), and after a reload (3.8 s to the key prompt) the file the
shell had edited is the original again (`check-chromium-final.log`, `check-firefox-final.log`,
`check-chromium-save.log`). Anthropic's API with a wrong key under the commented rule: Pi
shows Anthropic's `401 authentication_error: invalid x-api-key` (the request went through,
CORS passed); under the OpenRouter-only policy the same start shows `Error: Connection
error.` three times (`check-chromium-anthropic-rule.log`, `-norule.log`).

The real turn was not completed: the key in `~/.openrouter` is revoked (OpenRouter's
`/api/v1/key` answers 401 to it, as it did on 2026-10-25), so no model answered and nothing
was spent. What the night proves of the turn's path: the request leaves Pi's OpenAI client,
passes the policy and OpenRouter's CORS, and OpenRouter judges the key. The tool loop itself
(read, bash tool, edit) is `demos/pi/test/frontend-browser.mjs`'s scripted model.

## Measured (the second pass)

- `test/npm-browser.mjs chromium firefox` on the new templates (the README's block with `cc`,
  a colour edited in `theme.json`, the C tool's rows appended): passed, 34.5 s and 37.3 s
  of browser time (`npm-browser-both-2.log`). The first run failed in the test itself: the
  tree's catalog was narrowed to the three images rebuilt after the merge, and the test reads
  `default` from it.
- The workspace fetch, 302 files, in the page: sequential 0.30 s and concurrent 0.10 s on
  localhost; with 50 ms added to each request, 16.1 s against 0.18 s (`fetch-timing.log`).
- Builds of the stranger's image with `cc`: 23.3 s before, 18.8 s and 22.4 s after.
- Source suite 468 pass, `lint:dollyfiles` 193 recipes, before each commit.
- The tree's catalog: integrate's repin (816021e9f) changed 38 recipes (the x11 chain,
  mesa-build, xonotic, zero-ad among them), hours of builds; the plain `npm run image` was
  stopped after pi-local and the catalog narrowed to `default,pi-minimal,git,python,cc`
  (cache hits, 10 s), which the npm packages and their test need. The next catalog round
  makes it whole.

## Frictions left (the second pass)

- Saving a session in a page of one's own: `REQUIRES HOST snapshot@0` in the recipe puts the
  module in `index.mjs` and the Save button on the page, and a save takes 0.8 s. Loading one is the
  site's `/session/?name=` route (`src/site.mjs`), which the npm runtime does not carry and
  `boot()` has no option for: a save there cannot be opened. Not in the template until it can.
- The provider's host refused by the policy reads `Connection error.` in Pi (its SDKs hide the
  cause); the agent's own `curl` says `Browser HTTP policy denied the request`.
- `init` writes OpenRouter; a user who wants Anthropic edits two lines in two files. One place
  would mean the page writing the start script, which moves the sandbox's declaration out of
  the recipe.
- The template holds the model id of the day; Pi's `/model` lists its catalog's. A Haiku 5.5 on
  OpenRouter is not in Pi 1.0.3's catalog; `models.json` adds one.

## Proposals (the second pass)

- `boot({ session: NAME })`, or the session route in the npm runtime, so a page of one's own
  can open the sessions it saves; until then `snapshot@0` is write-only outside the site.
- The terminal's palette (`src/ghostty/display.c`): still compiled in. With it a file, Pi's
  `system` theme could follow the terminal and `theme.json` would be the one place for colours.

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
- (The second pass) A fake key never reaches the provider, so a green test with one proves
  nothing past the prompt: the README's path for Claude on OpenRouter died in a CORS preflight
  that no test had sent. A wrong key of the provider's format is the cheapest real request:
  its 401 proves the policy, CORS and the headers, and costs nothing.
- Read what the tasks say about a credential before planning a measurement on it: the key in
  `~/.openrouter` was recorded revoked on 2026-10-25; the real turn was planned on it anyway.
- A narrowed catalog (`DOLLY_BUILD_IMAGES`) breaks every test that reads `dist/dolly-images.mjs`,
  and after a merge that repins recipes the plain `npm run image` is hours, not seconds: plan
  the narrow set the tests need and say so, rather than start the whole and wait.
- The stranger reads the template's comment, not `dollyfile.md`: "downloads are not retained"
  was documented and still cost a failed tool; the comment now carries the `FILE` row.
