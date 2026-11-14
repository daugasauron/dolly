# Dolly from npm

Dolly is a POSIX-like userspace for wasm64 that runs in a browser tab. Its npm
packages hold the runtime, prebuilt programs and a build command, so a project
of your own needs no checkout of Dolly: `npm install` is its only download.
This document is the guide to them. Its main case is a coding agent of your
own: [Pi](https://github.com/earendil-works/pi) in a sandbox with the tools you
choose and your skills, served from your machine, and built into the same
static site in CI. What changed between versions is in the
[npm changelog](npm-changelog.md), and how to move a project to a new version
in [Upgrading](npm-upgrading.md).

## A Pi agent of your own

With Node.js 22, npm, Chrome and Python (for its static file server), in an
empty directory:

```sh
npm init --yes
npm install @daugasauron/dolly-build
npx dolly-build init my-pi git python nvim
npx dolly-build Dollyfile-my-pi my-pi
python3 -m http.server -d my-pi -b 127.0.0.1 8080
```

- `init` writes the project: Pi with Git, Python and Neovim here. It installs
  what the project needs and lacks with npm (the packages named, the host
  modules they declare), at `dolly-build`'s version, and prints that command.
- The second `dolly-build` builds the image in a headless browser (45 s for
  this project on a 16-core desktop) and writes the site `my-pi/` (94 MB).
- Python's server serves it. Open <http://127.0.0.1:8080/>: Pi asks for your
  OpenRouter key at a prompt that does not show it, and starts in `/workspace`.
  `curl https://example.com` in Pi's shell fails: the page's policy admits the
  model's provider and nothing else. Ctrl+D leaves Pi for a shell. Save
  (Ctrl+Shift+S) keeps the sandbox, files and all, in this browser and names it
  in the address (`?session=NAME`), which opens it again as it was.

After `npm install` and `init`, nothing is downloaded: the build, its browser,
the site and its page fetch from `node_modules` and from each other alone. The
build's browser reaches only a server the command runs on 127.0.0.1; its own
requests (its vendor's updates, clock and autofill) go to a proxy of the
command's that refuses them.

## The project

| File | What it declares | After a change |
| --- | --- | --- |
| `Dollyfile-my-pi` | The sandbox, a [recipe](dollyfile.md): `INSTALL` rows for Pi's packages and the ones you named, each pinned by its recipe's SHA-256; `FILE` rows with Pi's `AGENTS.md`, an extension with a `/hello` command, a `todo` tool, the model's entry and the script that starts Pi with its provider and model | Build again |
| `public/skills/` | Pi's skills, one directory each: a `SKILL.md` and the files it names. The page writes them into `~/.pi/agent/skills/` at each boot | Build again (the image is kept) |
| `public/workspace/` | The project the agent works on, written into `/workspace` at each boot | Build again (the image is kept) |
| `public/main.mjs` | The hosts the agent may reach ([HTTP policy](http.md)): one rule per host, OpenRouter's API to begin with. The files the page writes at boot | Build again (the image is kept) |
| `public/index.html`, `public/page.css`, `public/icon.svg` | The page, and the popups' font. No inline script or style, so the host may serve a strict Content-Security-Policy ([Embedding](embedding.md)) | Build again (the image is kept) |
| `public/theme.json` | The sandbox's colours: five values in Pi's theme format, whose background, text, accent and muted are the terminal's and the popups' too | Build again (the image is kept) |
| `.github/workflows/my-pi.yml` | The same build in GitHub Actions ([CI](#ci)) | |
| `package.json`, `package-lock.json` | The packages, at exact versions | `npm install` |
| `my-pi/` | The site `dolly-build` writes, which `.gitignore` leaves out | Reload |

A build that keeps the image takes seconds: the image is built again only when
the recipe or the installed runtime changed.

## Tools

A tool is a package: a program built inside Dolly from its upstream source,
with the packages it needs. `init` takes the ones to start with, and `add`
puts more into the recipe of a project, installing them first:

```sh
npx dolly-build add my-pi jq sqlite
```

| Package | What it brings |
| --- | --- |
| `git` | Git over the page's HTTP broker, with `diff` and `patch` |
| `python` | CPython 3.14 with pip; it brings `cc` and `libffi` |
| `numpy`, `pandas`, `matplotlib`, `seaborn`, `python-dateutil` | Python's data libraries, each with the ones it needs and `python` |
| `nvim` | Neovim, with its runtime files and tree-sitter parsers |
| `cc` | The C and C++ compiler, with `ld`, `ar`, Make and the headers |
| `jq`, `sqlite`, `less` | `jq`, `sqlite3` and the pager |
| Pi's own, which `init` always installs | `core` (the shell `slop` and its commands), `posix` (grep, sed, awk, find and the others), `curl`, `display` (the terminal), `dollyfile` (the recipe engine) and `pi-dolly` (Pi, its JavaScript runtime, ripgrep, fd, and Pi's Dolly skill and tools) |

`npx dolly-build init` with a name that is no package lists them all. A program
that is not among them is built in the recipe, where a compiler is: a `FILE`
row with a C source and `SLOP cc /tmp/NAME.c -o /usr/bin/NAME`, or
`SLOP pip install NAME==VERSION` followed by `FOLDER
/usr/lib/python3.14/site-packages`, which keeps what pip installed (pure-Python
wheels and sdists install). A script is a `FILE` row under `/usr/bin` with
`EXPORTS TOOL NAME`, as the template's `todo` is. The recipe's comments show
each.

A package declares the host modules its programs need (`python` declares
`sockets`), and a recipe's `REQUIRES HOST` rows must name them: `init` and
`add` write those rows and install the modules' packages
(`@daugasauron/dolly-host-NAME`). The site holds the modules its recipe
declares and no other.

## Skills and instructions

- A skill is a directory under `public/skills/` with a `SKILL.md`: front matter
  with its `name` and `description`, then what the agent does when a task
  matches the description (Pi's `docs/skills.md`, in the image under
  `/usr/lib/node_modules/@earendil-works/pi-coding-agent/docs/`). Scripts and
  other files a skill names lie beside it and are at
  `~/.pi/agent/skills/NAME/` in the sandbox. Pi lists the skills when it
  starts. `init` writes one, `changelog`.
- `AGENTS.md`, the instructions Pi takes into every session, is a `FILE` row of
  the recipe; so are an extension (`/hello`), the model's entry
  (`models.json`) and the script that starts Pi (`/etc/dolly/init.slop`).
  [An agent in place of a web frontend](agent-frontend.md) goes on from here:
  your backend's API, another model provider, how Pi starts.
- These files are not secrets: Pi's tools can read them, and so can its model.

## The policy and the key

`public/main.mjs` holds the page's HTTP policy: the hosts the sandbox may
reach, one rule each, with the header that may carry a credential. It is
enforced in the browser, outside the sandbox ([HTTP](http.md)). `init` writes
one rule, OpenRouter's API, and Anthropic's as a comment beside it. The key is
typed at `pi-key`'s prompt in the sandbox each time it starts; it is in no
file of the site. A host the agent should reach (`api.github.com`, `pypi.org`)
is one more rule.

## Build

`dolly-build Dollyfile-NAME OUT` writes the site `OUT`, replacing the one it
wrote there before: the files of `public/`, `workspace.json` and `skills.json`
(the files under `public/workspace/` and `public/skills/`), the runtime
(`dolly/`), the device host modules the recipe declares (`dolly-host-NAME/`),
`coi-serviceworker.js` and `image/`, the image's directory (its catalog,
metadata and packs, the recipes it was built from, its `amy-index.txt` and an
`index.mjs`).

- The build runs in a browser, with the installed runtime's own builder.
  Without `--browser` it takes the first this machine has of Chrome, Playwright's
  Chromium and Playwright's Firefox; `--browser chrome`, `chromium` or `firefox`
  names one (`npx playwright-core install chromium-headless-shell` or `firefox`
  installs Playwright's). It needs Chrome 138 or Firefox 146 or later, as the
  page does.
- Both commands run in the directory whose `node_modules/@daugasauron/` holds
  the packages (npm, pnpm and Yarn 1 alike; Yarn 2 and later need `nodeLinker:
  node-modules`). `init` and `add` install with the package manager that runs
  them (`npm install`, `pnpm add` or `yarn add`); their install is measured
  with npm alone.
- A recipe's steps reach the network only where the recipe says so: a `SOURCE`
  row, or a `SLOP` step such as `pip install`. The browser hands each such
  request to `dolly-build`, which fetches it in Node, so a host without CORS
  headers works, and through the proxy `HTTPS_PROXY` or `HTTP_PROXY` names; the
  log names each host a build reaches. What a step fetches is not part of the
  image's identity: pin versions (`pip install NAME==1.2`) where the bytes
  matter. `init`'s recipe has no such step.
- A recipe is at most 128 KiB. A `FILE` under `/workspace` is part of the
  image; the page's `public/workspace/` is written over it at each fresh boot.

## CI

`init` writes `.github/workflows/my-pi.yml`: on a push to `main`, a pull
request or by hand, it checks the project out, runs `npm ci`, installs
Playwright's headless Chromium (the version `package-lock.json` pins, with the
system libraries it needs), builds the site with it and uploads it as the
artifact `github-pages`:

```yaml
      - run: npm ci
      - run: npx playwright-core install --with-deps chromium-headless-shell
      - run: npx dolly-build Dollyfile-my-pi my-pi --browser chromium
      - uses: actions/upload-pages-artifact@v3
        with:
          path: my-pi
```

Commit the project as `init` left it (`package-lock.json` too; `.gitignore`
leaves out `node_modules/` and the site). The file ends with a `deploy` job as
comments, which publishes the site on GitHub Pages once the repository's
Pages source is "GitHub Actions". Pages sends no isolation headers; the page
isolates itself ([Serving](#serving)).

Elsewhere the same three commands are the job. In Playwright's container image
of the version of `playwright-core` the lockfile holds
(`mcr.microsoft.com/playwright:vVERSION-noble`), the browser is there already.
After `npm ci` and the browser, a CI build downloads nothing either.
`PLAYWRIGHT_DOWNLOAD_HOST` points the browser's download at a mirror.

How this is checked: `test/npm-browser.mjs` commits the project `init` wrote,
clones it, and runs the workflow's own `npm ci` and build lines in the clone,
in a network namespace whose only network is loopback, with Chrome and with
Firefox; the site's image is the one the project built. The workflow file has
not been run on GitHub's runners by Dolly's tests.

## Serving

The site is static: any file server serves it as it lies, from any path.

- Dolly needs shared memory, which a browser gives only to a cross-origin
  isolated page. Where the host sends `Cross-Origin-Opener-Policy: same-origin`
  and `Cross-Origin-Embedder-Policy: require-corp`, the page is isolated. Where
  it does not (Python's server, GitHub Pages), `init`'s page registers
  `coi-serviceworker.js`, which adds them to the site's own responses, and
  loads once more under it. A service worker needs HTTPS or `127.0.0.1`.
- The host must serve `.wasm` as `application/wasm`, `.mjs` as
  `text/javascript` and `.json` as `application/json`.
- The image's packs stay in the origin's private storage after the first
  visit, so the page starts again without downloading them.

## Updating

The packages of one project are of one version: `init` and `add` install at
`dolly-build`'s, and a build with two versions fails, naming both. To move a
project to a new version, install `dolly-build` at it; `add` then installs the
project's other packages at that version and writes the recipe's pins again:

```sh
npm install --save-exact @daugasauron/dolly-build@0.1.7
npx dolly-build add my-pi
npx dolly-build Dollyfile-my-pi my-pi
```

`add` writes every `FROM` and `INSTALL` row at the pin of the installed
package that holds its recipe. A row whose pin no installed package holds
fails the build, naming the row.

## The packages

| Package | What it holds |
| --- | --- |
| `@daugasauron/dolly-build` | The `dolly-build` command. It depends on the runtime, on `playwright-core`, which starts the build's browser, and on Pi's packages |
| `@daugasauron/dolly` | The runtime: `boot()`, the kernel, the process runtime, the image builder, and the host modules that are its own machinery ([Embedding](embedding.md)) |
| `@daugasauron/dolly-host-NAME` | One device host module each: `display`, `input`, `html`, `sockets`, `gpu`, `audio`, `microphone`, `touch`, `clipboard`, `upload`, `pty`, `console`, and `save`, which is `download@0` (npm takes no new name with that word) |
| `@daugasauron/dolly-package-NAME` | A package for a recipe to `INSTALL` ([Tools](#tools)): its catalog, metadata, packs and recipes. It depends on the packages it installs, so npm brings them |
| `@daugasauron/dolly-image-NAME` | A whole image for `boot()`: `default` (a shell and its tools), `pi-minimal` (Pi alone) and `python-data` (Python with NumPy, pandas, Matplotlib and seaborn) |

Each host module and image depends on the runtime alone. An image or package
does not depend on the host modules it declares: the page chooses its modules.

## A recipe on an image

A recipe may start `FROM` an installed image instead of installing packages:
the image package's README gives the row. `FROM` carries the base's files,
environment and exports but not its host modules or `ENTRY`, so the recipe
repeats those. `init` writes Pi's project only; the page in `public/` is then
[Embedding](embedding.md)'s, importing `./dolly/page/browser.mjs` and
`./image/index.mjs`, with the lines of `init`'s `main.mjs` that register
`coi-serviceworker.js`.

```sh
npm install @daugasauron/dolly-build   # with the install line of the image package's README
npx dolly-build Dollyfile-my-data my-data
```

To run a prebuilt image in a page with no build at all, see
[Embedding](embedding.md).

## When something fails

| Message | What to do |
| --- | --- |
| `NAME: no such package. The packages: …` | `init` and `add` take the names listed |
| `that install failed` | Run the printed `npm install` line yourself (a registry or proxy setting), then the command again |
| `no installed package holds … at that pin` | The packages were updated: `npx dolly-build add NAME` |
| `… holds X at another pin than …: install packages of one version` | Install every `@daugasauron` package at one version ([Updating](#updating)) |
| `NAME declares sockets: install @daugasauron/dolly-host-sockets` | A `REQUIRES HOST` row written by hand names a module that is not installed |
| `a browser is not installed` | Install Chrome, or `npx playwright-core install chromium-headless-shell` |
| `this browser has no WebAssembly memory64` | The build's browser is older than Chrome 138 or Firefox 146 |
| `Dollyfile-NAME:LINE: unknown directive` | A `FILE` row's body lines start with four spaces |
| The page says it is not cross-origin isolated | It is served over plain HTTP from another address than `127.0.0.1`: serve it over HTTPS, or send the two headers |
