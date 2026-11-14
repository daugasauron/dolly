# npm changelog

What changed in Dolly's npm packages (`@daugasauron/dolly`, `dolly-build`,
`dolly-host-NAME`, `dolly-image-NAME`, `dolly-package-NAME`), newest first:
the problems a user of them met and their fixes. [Dolly from npm](npm.md) is
the guide. The packages of one project are all of one version.

## 0.1.6

Moving a 0.1.5 project to it:

- The runtime's page code moved: a page imports `./dolly/page/browser.mjs`,
  where 0.1.5 had `./dolly/src/browser.mjs`.
- `init`'s recipe now `INSTALL`s Pi's packages instead of starting `FROM` the
  `pi-minimal` image. A 0.1.5 recipe with its `FROM` row still builds, with
  `@daugasauron/dolly-image-pi-minimal` installed.
- Install `@daugasauron/dolly-build` at 0.1.6, then `npx dolly-build add NAME`:
  it installs the project's other packages at that version and writes the
  recipe's pins.

A project in fewer steps:

- `npm install @daugasauron/dolly-build` is the whole install line. `init`
  installs what the project it writes needs and lacks (the packages named and
  the host modules they declare), with the package manager that runs it, at
  `dolly-build`'s version. Before, the line named nine packages, a package's
  host module (`sockets` for `python`) was the user's to find, and `init`
  stopped at the first package that was not installed.
- `dolly-build add NAME [PACKAGE…]` puts packages into an existing recipe and
  writes every row's installed pin. Before, a package added later needed its
  row and SHA-256 written by hand, and after an update of the packages the
  only source of the new pins was `init` in an empty directory.
- Skills are directories under `public/skills/`, a `SKILL.md` with its scripts
  beside it, which the page writes at boot; a change keeps the image. Before,
  each file of a skill was a `FILE` row of the recipe, its body indented four
  spaces.
- `init` writes `.github/workflows/NAME.yml`, which builds the site in GitHub
  Actions.
- The build takes the first browser the machine has (Chrome, Playwright's
  Chromium, Playwright's Firefox) and says in one line when there is none.
  Before, it wanted Chrome unless `--browser` said otherwise, and failed with
  Playwright's message.
- `dolly-build --help`, or an option it does not know, prints the usage.
  Before, it printed a stack trace.
- A name that is no package lists the packages there are.
- New packages: `nvim` (Neovim), `jq`, `sqlite`, `less`, and Pi's own as
  packages (`core`, `posix`, `curl`, `display`, `dollyfile`, `pi-dolly` and
  what they install).
- The build's log no longer says that the build "reaches" `dolly-build`'s own
  server on 127.0.0.1.

Builds:

- A recipe's steps reach the network through `dolly-build`, which fetches in
  Node: `SLOP pip install` works against an index without CORS headers, across
  a redirect between hosts, and through the proxy `HTTPS_PROXY` or `HTTP_PROXY`
  names, in every browser. Before, such a build needed browser switches.
- pip resolved a wheel's relative link against the relay's address; a relayed
  answer now carries the URL it came from.
- The build's browser starts without the environment's proxy variables:
  Firefox sent the page's own 127.0.0.1 address to the proxy and the build
  failed.
- The build checks first that the browser has WebAssembly memory64 and says so
  when it lacks it.
- An image keeps what pip installed once the recipe has `FOLDER
  /usr/lib/python3.14/site-packages` after the install.
- A `FILE` row under `/workspace` is part of the image.

The page `init` writes:

- No inline script or style (`index.html`, `page.css`, `main.mjs`), so a host
  may serve a strict Content-Security-Policy, which
  [Embedding](embedding.md) gives; an icon file of its own, so the browser
  asks for no `/favicon.ico`.
- Dolly's own UI (the boot log, dialogs, notices, indicators) takes the
  page's colours.
- A start fetches one metadata file and its packs ahead; the catalog is a
  quarter of its size.

## 0.1.5

- After `npm install`, nothing is downloaded: `dolly-build` builds from the
  installed packages and writes a static site (`public/`, the runtime, the
  host modules, the image, `coi-serviceworker.js`) that any file server
  serves. Before, the page lay beside `node_modules` and needed a server script
  of the project's own (`serve.mjs`) for the isolation headers.
- New: `@daugasauron/dolly-build`. `dolly-build init NAME [PACKAGE…]` writes a
  project (the recipe, the page, the policy, the theme and the workspace) and
  `dolly-build Dollyfile-NAME OUT` builds it, `INSTALL`ing installed packages
  or starting `FROM` an installed image. Before, the page and a server were
  pasted from the README, and a recipe of one's own needed a checkout of Dolly.
- Packages for a recipe to `INSTALL`: `git`, `cc`, `python`, `libffi`,
  `numpy`, `pandas`, `matplotlib`, `seaborn`, `python-dateutil`; the
  `python-data` image. A package depends on the packages it installs, so npm
  brings them.
- A project's page saves sessions in the browser and opens them again from
  its address (`?session=NAME`).
- `public/theme.json` sets Pi's colours and the terminal's.
- `public/workspace/` is listed in `workspace.json`, so a static host serves
  a project of any number of files; path segments are encoded.
- A recipe error is one line naming the row. Before, a body line without its
  four spaces failed with a Node stack trace.
- `dolly-build` finds the packages where pnpm installs them, replaces only a
  site it wrote before, and keeps the image when only `public/` changed.
- `init` writes a `.gitignore` and names the host module a package needs.
- Moving a 0.1.4 page to it: `index.html` goes into `public/` and imports
  `./dolly/src/browser.mjs` and `./image/index.mjs`, the site `dolly-build`
  writes is what is served, and `serve.mjs` is dropped.

## 0.1.4

- First packages: `@daugasauron/dolly` (the runtime), one
  `@daugasauron/dolly-host-NAME` per device host module, and the `default` and
  `pi-minimal` images. Each depends on the runtime alone; no bundler is needed.
- `download@0`'s package is `dolly-host-save`: npm refuses a new name with
  the word "download".
- `boot()` takes `files`, written over the image before its program starts.
- Prerelease versions (`0.1.4-rc.0`) are published beside a release.
