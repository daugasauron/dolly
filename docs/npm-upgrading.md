# Upgrading Dolly's npm packages

For a project that already uses the packages: what a new version gives it,
what it changes under it, and the commands that move it. [Dolly from
npm](npm.md) is the guide to the packages and [the changelog](npm-changelog.md)
lists every change. The packages of one project are all of one version.

## From 0.1.7 to 0.1.8

The recipe language is `DOLLY 8`: a site path no longer starts with the
version, so `FROM /v0.1.7/Dollyfile-system SHA256` is `FROM /Dollyfile-system
SHA256`, and a recipe's rows stay as they are across versions that do not
change the package they name. A `DOLLY 7` recipe is refused, naming its first
line. In a project `dolly-build init` made (here `my-pi`):

```sh
npm install --save-exact @daugasauron/dolly-build@0.1.8
sed -i -e '1s/^DOLLY 7$/DOLLY 8/' -e 's|^SOURCE /v0\.1\.7/|SOURCE /|' Dollyfile-my-pi
npx dolly-build add my-pi
npx dolly-build Dollyfile-my-pi my-pi
```

`add` writes every `FROM` and `INSTALL` row at its new path and pin; the
`sed` moves the first line and any `SOURCE` row that names a file of the
site.

The requests the site's sandbox may make move into the recipe. A recipe
without `HTTP` rows now reaches nothing, whatever `public/main.mjs` admits:
the page applies the rows over its own policy. Write each rule of 0.1.7's
`main.mjs` as a row after the `REQUIRES HOST` rows, its methods, origin and
path, then its `credentialHeaders`:

```text
HTTP GET POST https://openrouter.ai/api/v1/* authorization
```

Then take the policy out of `main.mjs` (`const policy` and `http: { policy }`),
or leave it: the page admits only what both allow. The build prints what the
site may reach. A recipe of 0.1.7's `init` keeps its OpenRouter key prompt and
model entry, which still work; a new `init` writes neither
([changelog](npm-changelog.md)).

A 0.1.7 project's recipe declares `REQUIRES HOST snapshot@0`, the page's saves:
keep the row for them (`Ctrl+Shift+S`), or remove it, as a new `init` does,
for a page without them; its page then opens no `?session=` address.

## From 0.1.5 to 0.1.7

### The upgrade in short

A project `dolly-build init` made (here `my-pi`):

```sh
npm install --save-exact @daugasauron/dolly-build@0.1.7
npx dolly-build add my-pi
sed -i 's|/dolly/src/browser.mjs|/dolly/page/browser.mjs|' public/index.html
npx dolly-build Dollyfile-my-pi my-pi
```

A page that runs a prebuilt image with `boot()`:

```sh
npm install --save-exact $(npm pkg get dependencies | grep -o '@daugasauron/[a-z0-9-]*' | sed 's/$/@0.1.7/')
sed -i 's|/dolly/src/browser.mjs|/dolly/page/browser.mjs|' index.html
```

Both are explained step by step [below](#a-dolly-build-project), with what to
check afterwards.

### What is better

Starting a project:

- One install line. `npm install @daugasauron/dolly-build`, then `npx
  dolly-build init my-pi git python nvim` installs the packages it names and
  the host modules they declare, at `dolly-build`'s version. In 0.1.5 the line
  named ten packages, among them the host module `python` needs.
- `npx dolly-build add NAME [PACKAGE…]` puts more tools into a recipe, writes
  every row's pin from the installed packages, and declares the host modules
  the packages need. In 0.1.5 a tool added
  later was a row and a SHA-256 written by hand.
- Skills are directories: `public/skills/NAME/` with a `SKILL.md` and its
  scripts, written into Pi's skills at boot. A change to a skill keeps the
  image. In 0.1.5 each file of a skill was a `FILE` row of the recipe, its
  body indented four spaces, and a change built the image again.
- `init` writes `.github/workflows/NAME.yml`, which builds the site in GitHub
  Actions.
- The build takes the first browser the machine has (Chrome, Playwright's
  Chromium, Playwright's Firefox). `--help` prints the usage, a name that is no
  package lists the packages, and a row whose pin is stale names the command
  that writes it.

Pi:

- Pi asks the user for a file. Its new `upload` tool opens the page's file
  dialog, and Pi gets the file's path and size, or that the user cancelled;
  the `download` and `upload` commands are in its shell too.

More to install:

- Tools: `nvim` (Neovim with its tree-sitter parsers), `jq`, `sqlite`, `less`,
  `transfer` (the `download` and `upload` commands).
- Pi's parts as packages of their own, which `init`'s recipe installs in place
  of the `pi-minimal` image: `core`, `posix`, `curl`, `display`, `dollyfile`,
  `pi-dolly`, with `pi`, `quickjs`, `janis`, `ripgrep`, `fd`, `sbase`, `gzip`,
  `html`, `secretenv` and `dolly-docs`. A recipe can leave one out or build on
  a few of them without Pi.
- The host modules' headers and client libraries, one package each
  (`libdolly-display`, `libdolly-input`, `libdolly-sockets` and the others),
  for a C program the recipe compiles.
- Host modules: `@daugasauron/dolly-host-clipboard` (the page's clipboard as
  text a program reads and writes) and `@daugasauron/dolly-host-console`.

Building:

- A recipe's steps reach the network: `SLOP pip install NAME==VERSION` works,
  against an index without CORS headers, across redirects and through the
  proxy `HTTPS_PROXY` names, in every browser, since `dolly-build` fetches for
  the build in Node. `FOLDER /usr/lib/python3.14/site-packages` after the
  install keeps what pip installed in the image.
- A `FILE` row under `/workspace` is part of the image. In 0.1.5 `/workspace`
  was never kept.
- The build says first when its browser lacks WebAssembly memory64.

The page:

- It starts faster: the measurements are [below](#measured).
- Dolly's own UI in the element (the boot log, dialogs, notices, indicators)
  takes the page's colours, as the terminal and the popups did.
- `init`'s page has no inline script or style, so a host may serve a strict
  Content-Security-Policy; [Embedding](embedding.md) gives the policy Dolly
  runs under. Neither `boot()` nor a host module writes a script or style
  element any more.
- `boot()`'s handle has `openConsole()`, with `console@0`: a terminal, or a
  program on three pipes, that the page holds into the session.
- `amy` in a page of your own takes packages from the page's image directory,
  or from another the session names with `amy server URL`.

Sessions:

- A save is the whole filesystem, up to 8 GiB and 1,000,000 paths. In 0.1.5
  it was the changes against the image, up to 512 MiB and 100,000 paths.
- A save opens without loading the image, and keeps opening after the
  project's recipe changed and its image was built again, as long as the
  runtime's image build ID is the same.
- A tab asks before its save replaces one another tab stored.

### What changes under an existing project

| What | 0.1.5 | 0.1.7 | What to do |
| --- | --- | --- | --- |
| The runtime's page code | `@daugasauron/dolly/src/browser.mjs` | `@daugasauron/dolly/page/browser.mjs` (`src/` is gone: the package holds `page/`, `site/`, `host/` and `dist/`) | Change the import in the page: `./dolly/page/browser.mjs` in a `dolly-build` site, `./node_modules/@daugasauron/dolly/page/browser.mjs` beside `node_modules`. A bare `import "@daugasauron/dolly"` through an import map or a bundler follows the package's `exports` and needs no change |
| A recipe's pins | `FROM /v0.1.5/… SHA256`, `INSTALL /v0.1.5/… SHA256` | The same rows name `/v0.1.7/…` and other pins | `npx dolly-build add NAME` writes them |
| The base of `init`'s recipe | `FROM` the `pi-minimal` image | `INSTALL` rows of Pi's packages; no `FROM` | Nothing: a recipe that starts `FROM pi-minimal` builds as before, with `@daugasauron/dolly-image-pi-minimal` installed |
| Module headers (`<dolly/display.h>`, `input.h`, `download.h`, `upload.h`, `nena.h`, `packages.h`, `pty.h`, `sockets.h` and the others) | In the `cc` package | Each module's header and client library is the package `libdolly-NAME`; `cc` holds none | A recipe that compiles against one: `npx dolly-build add NAME libdolly-display` (and the others it includes); the build stops at the `#include` until then |
| Pi's host modules | `display`, `input`, `download`, `html` | Also `upload`: `pi-dolly` declares `upload@0` for Pi's `upload` tool | `npx dolly-build add NAME` writes `REQUIRES HOST upload@0` into the recipe and installs `@daugasauron/dolly-host-upload`; without the row the build stops with `/bin/upload uses upload@0: add REQUIRES HOST upload@0`. A page that boots `pi-minimal` itself installs that package |
| The `default` image | Holds `html` and declares `html@0` | Holds no `html` and does not declare `html@0` | A page that runs `default` no longer needs `@daugasauron/dolly-host-html`. For the `html` command, build a recipe that installs the `html` package |
| Saved sessions | A save opens on the image it was made on | A save records the runtime's image build ID, which 0.1.7 changed | A 0.1.5 save is not found by the 0.1.7 page: see [Saved sessions](#saved-sessions) |
| `/workspace` in a recipe | Never kept | Kept as any path | A `FILE /workspace/…` row is now in the image; the page's `public/workspace/` still lies over it at a fresh boot |
| `dolly-build` without `--browser` | Chrome, or it fails | The first of Chrome, Playwright's Chromium and Firefox | Nothing; a CI job that must use one browser names it |
| `dolly-build`'s dependencies | The runtime and `playwright-core` | Also Pi's packages (`pi-dolly` and what it installs) | Nothing: npm installs them with it |

Unchanged: the recipe language (`DOLLY 7`), `boot()`'s options (`images`,
`image`, `modules`, `site`, `http`, `files`, `session`), the names of the host
module packages, the HTTP policy's format, the files a site holds
(`workspace.json`, `image/`, `dolly/`, `coi-serviceworker.js`), and the
headers a host sends (the two isolation headers, and the types of `.wasm`,
`.mjs` and `.json`).

### A dolly-build project

In the project's directory, with its 0.1.5 packages installed:

1. Install the command at the new version, exactly:

   ```sh
   npm install --save-exact @daugasauron/dolly-build@0.1.7
   ```

2. Let it move the rest. `add` installs every `@daugasauron` package of
   `package.json` at `dolly-build`'s version (it prints the `npm install` line
   it runs), writes the pins of the recipe's `FROM` and `INSTALL` rows, and
   declares the host module Pi gained, `REQUIRES HOST upload@0`, installing
   `@daugasauron/dolly-host-upload`:

   ```sh
   npx dolly-build add my-pi
   ```

3. Change the page's import. 0.1.5's `init` wrote it into
   `public/index.html`:

   ```sh
   sed -i 's|/dolly/src/browser.mjs|/dolly/page/browser.mjs|' public/index.html
   ```

4. If the recipe compiles a C program against a module's header, add that
   module's package (the build stops at the `#include` otherwise):

   ```sh
   npx dolly-build add my-pi libdolly-display
   ```

5. Build, and serve as before:

   ```sh
   npx dolly-build Dollyfile-my-pi my-pi
   python3 -m http.server -d my-pi -b 127.0.0.1 8080
   ```

The project now runs on 0.1.7 as it was. The rest is optional, each on its
own:

- **Skills as directories.** Move each skill's `FILE` rows out of the recipe
  into `public/skills/NAME/` (the bodies without their four spaces), and have
  the page write them: in the page's script, the block that fetches
  `workspace.json` becomes the loop of 0.1.7's `main.mjs` over `workspace` and
  `skills`. The simplest way to get that file is the next point.
- **The page without inline code.** In an empty directory, `npm install
  @daugasauron/dolly-build@0.1.7` and `npx dolly-build init my-pi` write
  0.1.7's `public/index.html`, `main.mjs`, `page.css` and `icon.svg`, and
  `.github/workflows/my-pi.yml`. Copy them into the project, and carry your
  policy rules from the old `index.html` into `main.mjs`. `theme.json` and
  `workspace/` stay as they are.
- **A recipe of packages.** Replace the `FROM …pi-minimal` row with the
  `INSTALL` rows of that fresh project's recipe (`core`, `dollyfile`, `posix`,
  `display`, `curl`, `pi-dolly`), then `npm uninstall
  @daugasauron/dolly-image-pi-minimal`.

### A page with boot()

1. Install every Dolly package of the page at the new version:

   ```sh
   npm install --save-exact $(npm pkg get dependencies | grep -o '@daugasauron/[a-z0-9-]*' | sed 's/$/@0.1.7/')
   ```

2. Change the import of the runtime in the page (and anywhere else it is
   named):

   ```sh
   sed -i 's|/dolly/src/browser.mjs|/dolly/page/browser.mjs|' index.html
   ```

3. A page that runs `pi-minimal` also installs the module Pi gained:

   ```sh
   npm install --save-exact @daugasauron/dolly-host-upload@0.1.7
   ```

   A page that runs `default` and listed its modules by hand may drop
   `dolly-host-html`. A page that takes `modules` from the image's `index.mjs`
   changes nothing else.

`boot()`'s options and the handle it resolves to are as they were. The server
sends the same headers.

### Saved sessions

A save is kept in the browser, for the page's origin and the version that made
it, and opens only on a runtime with the image build ID of the one that made
it. 0.1.7's is another than 0.1.5's (the seed and the process contracts
changed). The upgraded page does not find a session a 0.1.5 page saved:
`?session=NAME` answers `Session 'NAME' was not found in this browser.`

So get the files you want to keep out before the upgrade, on the 0.1.5 page:
`download FILE` from the shell where the image has it (`default` does), or
Pi's download tool. After the upgrade, `public/workspace/` puts files into a
fresh start, and Save makes a save that 0.1.7 opens again.

Dolly's own site lists saves at `/sessions/`, where **Recover files** copies
an older save's files into a new session; a page of your own has that list
only if it names a `site` that serves those pages. Going back is not a way
out that was found to work: the 0.1.5 site served again from the same address
did not open its save in a browser that had visited the 0.1.7 site in
between (once, in Chrome).

### Checks

- `npm ls --all 2>/dev/null | grep -c '@daugasauron/.*@0\.1\.5'` prints `0`:
  no package of the old version is left.
- `grep -c '/v0\.1\.5/' Dollyfile-my-pi` prints `0`.
- The build ends with `dolly-build: my-pi is the site of my-pi`.
- The page boots: Pi asks for its key and lists its skills. Ctrl+D, then the
  tools the recipe installs answer (`git --version`, `python --version`), and
  `curl https://example.com` is refused by the policy.
- Save (Ctrl+Shift+S) and a reload at the address it names open the session.

### Measured

A project made with 0.1.5 from the public registry (2026-11-14: `init my-pi
git python numpy matplotlib`, with a C tool that includes `<dolly/display.h>`,
a skill as `FILE` rows and a file in the workspace), upgraded to the
0.1.7-rc.0 packages by the steps above as written (with `add` as 0.1.7 has
it: rc.0's left `upload@0` out of a recipe that starts `FROM` an image),
built with Chrome 156, and
its site served by `python3 -m http.server`. Times are from navigation, on one
16-core desktop that ran other builds, in headless Chrome 156 and Playwright's
Firefox 155; each first visit in a fresh profile.

| | 0.1.5 | 0.1.7-rc.0 |
| --- | --- | --- |
| Chrome, first visit: the page ready / Pi's screen | 4.8 s / 6.9 s | 1.5 s / 3.4 s |
| Chrome, second visit | 5.3 s / 8.1 s | 1.2 s / 3.5 s |
| Firefox, first visit | 11.7 s / 14.6 s | 2.2 s / 4.2 s |
| Firefox, second visit | 4.3 s / 6.3 s | 1.6 s / 3.7 s |
| A saved session, reopened in Chrome: the page ready | not measured | 0.7 s |
| The site | 100 MB | 100 MB |
| `node_modules` | 125 MB | 173 MB (Pi's packages beside the `pi-minimal` image this project keeps) |

The upgraded project builds and boots in both browsers: Pi starts with its
three skills, the C tool, Git, Python with NumPy and Matplotlib and the
`upload` command are there, `curl https://example.com` is refused, and a
session saved there opens again. Before step 4 the build stopped at
`'dolly/display.h' file not found`, and without the `upload@0` row at
`/bin/upload uses upload@0`.

A page that ran 0.1.5's `default` with `boot()`, upgraded by the two commands
above: it boots in both browsers with the nine modules the image declares,
`html` is no longer a command, and its 0.1.5 save is not found.

Not measured: build times against each other (the machine was busy: 54 s for
the 0.1.5 build, 95 s for the 0.1.7 one), pnpm and Yarn, and the optional
steps (skills as directories, the page without inline code, a recipe of
packages) on this project.
