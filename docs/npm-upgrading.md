# Upgrading Dolly's npm packages

For a project that already uses the packages: what a new version gives it,
what it changes under it, and the commands that move it. [Dolly from
npm](npm.md) is the guide to the packages and [the changelog](npm-changelog.md)
lists every change. The packages of one project are all of one version.

## From 0.1.5 to 0.1.6

### The upgrade in short

A project `dolly-build init` made (here `my-pi`):

```sh
npm install --save-exact @daugasauron/dolly-build@0.1.6
npx dolly-build add my-pi
sed -i 's|/dolly/src/browser.mjs|/dolly/page/browser.mjs|' public/index.html
npx dolly-build Dollyfile-my-pi my-pi
```

A page that runs a prebuilt image with `boot()`:

```sh
npm install --save-exact $(npm pkg get dependencies | grep -o '@daugasauron/[a-z0-9-]*' | sed 's/$/@0.1.6/')
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
- `npx dolly-build add NAME [PACKAGE…]` puts more tools into a recipe and
  writes every row's pin from the installed packages. In 0.1.5 a tool added
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

More to install:

- Tools: `nvim` (Neovim with its tree-sitter parsers), `jq`, `sqlite`, `less`.
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

| What | 0.1.5 | 0.1.6 | What to do |
| --- | --- | --- | --- |
| The runtime's page code | `@daugasauron/dolly/src/browser.mjs` | `@daugasauron/dolly/page/browser.mjs` (`src/` is gone: the package holds `page/`, `site/`, `host/`, `process/` and `dist/`) | Change the import in the page: `./dolly/page/browser.mjs` in a `dolly-build` site, `./node_modules/@daugasauron/dolly/page/browser.mjs` beside `node_modules`. A bare `import "@daugasauron/dolly"` through an import map or a bundler follows the package's `exports` and needs no change |
| A recipe's pins | `FROM /v0.1.5/… SHA256`, `INSTALL /v0.1.5/… SHA256` | The same rows name `/v0.1.6/…` and other pins | `npx dolly-build add NAME` writes them |
| The base of `init`'s recipe | `FROM` the `pi-minimal` image | `INSTALL` rows of Pi's packages; no `FROM` | Nothing: a recipe that starts `FROM pi-minimal` builds as before, with `@daugasauron/dolly-image-pi-minimal` installed |
| Module headers (`<dolly/display.h>`, `input.h`, `download.h`, `upload.h`, `nena.h`, `packages.h`, `pty.h`, `sockets.h` and the others) | In the `cc` package | Each module's header and client library is the package `libdolly-NAME`; `cc` holds none | A recipe that compiles against one: `npx dolly-build add NAME libdolly-display` (and the others it includes). A program links a client with `-ldolly-NAME` |
| The `default` image | Holds `html` and declares `html@0` | Holds no `html` and does not declare `html@0` | A page that runs `default` no longer needs `@daugasauron/dolly-host-html`. For the `html` command, build a recipe that installs the `html` package |
| Saved sessions | A save opens on the image it was made on | A save records the runtime's image build ID, which 0.1.6 changed | A 0.1.5 save does not open in 0.1.6: see [Saved sessions](#saved-sessions) |
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
   npm install --save-exact @daugasauron/dolly-build@0.1.6
   ```

2. Let it move the rest. `add` installs every `@daugasauron` package of
   `package.json` at `dolly-build`'s version (it prints the `npm install` line
   it runs) and writes the pins of the recipe's `FROM` and `INSTALL` rows:

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

The project now runs on 0.1.6 as it was. The rest is optional, each on its
own:

- **Skills as directories.** Move each skill's `FILE` rows out of the recipe
  into `public/skills/NAME/` (the bodies without their four spaces), and have
  the page write them: in the page's script, the block that fetches
  `workspace.json` becomes the loop of 0.1.6's `main.mjs` over `workspace` and
  `skills`. The simplest way to get that file is the next point.
- **The page without inline code.** In an empty directory, `npm install
  @daugasauron/dolly-build@0.1.6` and `npx dolly-build init my-pi` write
  0.1.6's `public/index.html`, `main.mjs`, `page.css` and `icon.svg`, and
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
   npm install --save-exact $(npm pkg get dependencies | grep -o '@daugasauron/[a-z0-9-]*' | sed 's/$/@0.1.6/')
   ```

2. Change the import of the runtime in the page (and anywhere else it is
   named):

   ```sh
   sed -i 's|/dolly/src/browser.mjs|/dolly/page/browser.mjs|' index.html
   ```

3. A page that runs `default` and listed its modules by hand may drop
   `dolly-host-html`; a page that takes `modules` from the image's `index.mjs`
   changes nothing.

`boot()`'s options and the handle it resolves to are as they were. The server
sends the same headers.

### Saved sessions

A save is kept in the browser, for the page's origin, and opens only on a
runtime with the image build ID of the one that made it. 0.1.6's is another
than 0.1.5's (the seed and the process contracts changed), so a session saved
by a 0.1.5 page does not open in the upgraded page.

To carry files over, get them out before the upgrade, on the 0.1.5 page: in a
`dolly-build` project Pi's download tool, or `download FILE` from the shell
where the image has it; in a page that runs `default`, `download FILE`. After
the upgrade, `public/workspace/` puts files into a fresh start, and Save makes
a save 0.1.6 opens again.

Dolly's own site lists saves at `/sessions/`, where **Recover files** copies
an older save's files into a new session; a page of your own has that list
only if it names a `site` that serves those pages.

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

The 0.1.5 and 0.1.6 numbers are filled in here once the 0.1.6-rc.0 packages are verified.
