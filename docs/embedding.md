# Embedding Dolly

Dolly is a POSIX-like userspace for wasm64 that runs in a browser tab: a Wasm
kernel, programs in private Wasm memories, and host modules that bridge it to
the browser. These npm packages put it in a page of your own. Their first use is
an agent in place of a web frontend (`docs/agent-frontend.md` in the repository).

| Package | What it holds |
| --- | --- |
| `@daugasauron/dolly` | The runtime: `boot()`, the kernel, the process runtime, its image builder, and the host modules that are its own machinery (`runtime`, `http`, `threads`, `dso`, `stack`, `nena`, `snapshot`, `packages`) |
| `@daugasauron/dolly-host-NAME` | One device host module each: `display` (Ghostty's terminal and programs' frames), `input`, `gpu`, `audio`, `microphone`, `touch`, `download` (as `dolly-host-save`: npm takes no new name with the word), `upload`, `html`, `sockets`, `pty` |
| `@daugasauron/dolly-image-default` | The `default` image alone: a shell, its text tools, the terminal, curl, `amy`, `nena`, `ps`, `html`. The package holds no package index, so `amy installed` lists what the image holds and `amy list` and `amy install` fail naming the index |
| `@daugasauron/dolly-image-pi-minimal` | The `pi-minimal` image alone: the Pi coding agent with JavaScript (Janis), a shell, POSIX tools, curl, ripgrep and fd, on `display`, `input`, `download` and `html` alone. The README's "Pi with npm" serves it with a policy |
| `@daugasauron/dolly-image-python-data` | The `python-data` image: `default` with Python 3.14, pip and the C compiler, NumPy, pandas, Matplotlib (Agg) and seaborn, built in Dolly from their PyPI releases. Its README gives the install line (it declares `sockets` too) and the `FROM` row of a recipe built on it |
| `@daugasauron/dolly-package-NAME` | A package for an image of your own: `git` (with diff and patch), `python` (3.14 with pip; it brings `cc`) or `cc` (the C and C++ compiler with Make). Its directory holds its catalog, metadata, packs and recipes, as an image package does, and nothing to boot |
| `@daugasauron/dolly-build` | The `dolly-build` command: a project with an image of your own, `FROM` `pi-minimal` with the packages it `INSTALL`s, built in a browser ("Your own image" below) |

```sh
npm install @daugasauron/dolly @daugasauron/dolly-image-default \
  @daugasauron/dolly-host-display @daugasauron/dolly-host-input @daugasauron/dolly-host-audio \
  @daugasauron/dolly-host-touch @daugasauron/dolly-host-save @daugasauron/dolly-host-upload \
  @daugasauron/dolly-host-html @daugasauron/dolly-host-sockets
```

Each host module and image depends on the runtime alone, at its own version. An
image does not depend on the host modules it declares: install them with it (its
README names them), so that all lie side by side under `node_modules/@daugasauron/`.
npm, pnpm and Yarn 1 install them so. Yarn 2 and later need `nodeLinker: node-modules`
in `.yarnrc.yml`: Plug'n'Play leaves no files to serve.

## A page

```html
<!doctype html>
<meta charset="utf-8">
<main id="dolly" style="position:fixed;inset:0"></main>
<script type="module">
  import { boot } from "./node_modules/@daugasauron/dolly/src/browser.mjs";
  import { images, image, modules } from "./node_modules/@daugasauron/dolly-image-default/index.mjs";
  const dolly = await boot(document.querySelector("#dolly"), { images, image, modules });
</script>
```

`boot(element, options)` runs an image in `element`, which the page sizes. It
resolves once the image's program starts, to the page's handle on the session
(`hostModules`, `visibleTerminalText()`, `waitForInteractiveTerminal(pattern)`,
then `submit(command)` at the shell's prompt, and what each module adds), and
shows its own failure in the element. What Dolly shows, its modules' buttons,
dialogs and indicators among them, stays inside `element`, and its styles
select only there; keys typed outside it, into the page's own controls, are
the page's.

| Option | Meaning |
| --- | --- |
| `images` | URL of an image directory: `dist/dolly-images.json`, the images' metadata and packs, their recipes, all data. `@daugasauron/dolly-image-default`'s `index.mjs` exports its own. A page has one image directory. The packs an image reads stay in the origin's private storage, so it starts again without downloading them (`src/pack-store.mjs`) |
| `image` | The image to run, by name |
| `modules` | URLs of the `module.json` of each host module the page has. The registry loads these and no other; an image's `REQUIRES HOST` must be among them |
| `site` | Optional: the URL of a site that serves Dolly's own pages (`session/`, `sessions/`, `docs/`), as Dolly's site does. Given, a saved session names itself in the tab's URL as the site's session route and modules link to those pages |
| `http` | Optional `{ policy, relays }` for the HTTP broker, the page's one network edge (docs/http.md). Without a policy a program may fetch any HTTPS URL |
| `files` | Optional `{ "/absolute/path": text or Uint8Array }`, written over the image before its program starts: Pi's instructions and skills (`docs/agent-frontend.md`), a start script. Programs can read them; they are not for secrets |
| `session` | Optional: the name of a session saved in this browser, opened as it was saved in place of a fresh start (`files` are not written over it). It needs `snapshot@0`, whose Save (Ctrl+Shift+S) keeps a session in the browser's storage for the page's origin and, on a page without a `site`, names it in the tab's address as `?session=NAME` for the page to give back here |

The page, not the image, chooses the modules and the policy, before anything of
the image runs. A program reaches nothing of the browser but through them.

## More host modules

`default` declares `nena@0`, so a session can enable a module the page has and
the image does not declare. Install its package and add its `module.json`:

```sh
npm install @daugasauron/dolly-host-gpu @daugasauron/dolly-host-microphone @daugasauron/dolly-host-pty
```

```js
const gpu = new URL("./node_modules/@daugasauron/dolly-host-gpu/module.json", location.href).href;
const dolly = await boot(element, { images, image, modules: [...modules, gpu] });
```

`nena enable gpu` then gives a program the GPU, or, where the browser has no
WebGPU adapter, a device that fails to open with `ENODEV`.

## Colours

The terminal's colours and the popups' are the page's, not the image's. Set
these on the element (or above it) in your style sheet to match your page;
unset, they are Dolly's:

```css
#dolly {
  --dolly-background: #262626;          /* the terminal's and the popups' */
  --dolly-color: #e8e3d7;               /* their text */
  --dolly-accent: #f2d45c;              /* the cursor and the selection; the popups' headings, buttons, focus */
  --dolly-display-palette-1: #e8e3d7;   /* -0 to -15: the 16 colours programs name */
}
```

Unset, of the 16 colours programs name, black (`-0`) is the background, yellow
and bright yellow (`-3`, `-11`) the accent, bright black (`-8`) `#77736c` and
the others the text's colour, so a program's red shows as its text does. A
value may be any CSS colour; one that is not counts as unset. The terminal
takes them at boot and whenever they change, by any rule or media query; a
popup as it opens.

## Popups

`html@0` shows a program's HTML document in a popup over the terminal, in
boot()'s element: a report, or a form whose submitted fields go back to the
program (Pi's `ask_user` and `show_html`). The popup takes the document's text,
headings, lists, tables and forms and nothing else of it; its look is the
page's: the colours above and these, unset Dolly's:

```css
#dolly {
  --dolly-html-font: ui-monospace, monospace;
  --dolly-html-color-scheme: dark;       /* the form controls' own colours */
  --dolly-html-font-file: none;          /* or url(…): the font of the first family above */
}
```

The popup loads nothing itself: the page fetches the font file, once, and hands
the popup its bytes; without one, name fonts the system has. The page reads the
properties each time a popup opens. Dolly's site sets
`"Dolly IosevkaTerm SemiBold", monospace` and its font file.

## Serving

- Serve the installed packages as they lie: the runtime finds its own files
  beside itself, and `dolly-image-default`'s `index.mjs` finds the modules in the
  packages installed beside it under `node_modules/@daugasauron/`.
- Send `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` with the page: Dolly needs shared
  memory, which a browser gives only to a cross-origin isolated page.
- Serve `.wasm` as `application/wasm`, `.mjs` as `text/javascript` and `.json`
  as `application/json`: a browser imports a host module's manifest and an image
  directory's catalog and metadata only with that type.
- No bundler is needed: these are ES modules, Workers and Wasm files.

## Your own image

`dolly-build` builds a Dollyfile (`docs/dollyfile.md` in the repository)
`FROM` the installed `pi-minimal`, with the packages whose directories are
installed beside it, into a directory laid out as an image package: its catalog,
its metadata and packs, the recipes it was built from and an `index.mjs`. The
build runs in a headless browser, with the installed runtime's own builder, as
the catalog's images are built; the command serves the packages to it on
127.0.0.1 and writes what it hands back.

```sh
npm install @daugasauron/dolly-build @daugasauron/dolly-package-git
npx dolly-build init my-pi git
npx dolly-build Dollyfile-my-pi my-pi
```

- `dolly-build init NAME [PACKAGE…]` writes a project where the packages are
  installed, and refuses to write over a file: `Dollyfile-NAME` (the host modules
  of `pi-minimal` and of each package, `FROM` `pi-minimal` and `INSTALL` of each
  package at the installed pins, rows for Pi's instructions, a skill, an extension,
  a tool and the script that starts Pi, and `pi-minimal`'s `ENTRY`), `index.html`
  (the policy, the popups' font, and the files of `workspace/` and `theme.json`
  for `boot()`'s `files`, listed by `workspace.json`), `theme.json` (the sandbox's
  colours: Pi's theme, written over the image's at boot, whose background, text,
  accent and muted the page sets as the terminal's and the popups'), `serve.mjs` (isolation, the listing,
  relays), `workspace/README.md` and, unless the project has one, a
  `.gitignore` for `node_modules/` and the image directory. It names the host module
  package to install when a package needs one the page lacks (`python`'s `sockets`).
  The repository README's "Pi with npm" says what each file is for.
- The recipe is the one place that declares the sandbox. Add rows before `ENTRY`:
  `FILE` with a body (indented four spaces) for a file, `INSTALL` of a package
  whose directory is installed (every package it needs comes with it, so `python`
  brings `cc`), `SLOP` to run the image's tools at build time. `FROM` carries the
  base's files, environment and exports but not its host modules or `ENTRY`, so the
  recipe repeats those; a package's `REQUIRES HOST` rows must be among the recipe's,
  and the build names a missing one. A recipe is at most 128 KiB; `/workspace` is
  never part of an image (`boot()`'s `files` writes the project at each boot).
- `dolly-build Dollyfile-NAME OUT` builds it into `OUT`, replacing the image
  directory a build wrote there before:
  `--browser chrome` (the default: your Chrome), `chromium` or `firefox`
  (Playwright's, after `npx playwright-core install chromium` or `firefox`).
  Both commands run where the packages are installed: the directory whose
  `node_modules/@daugasauron/` holds them (npm, pnpm and Yarn 1 alike). A row
  that names an image no installed package holds at that pin fails naming the row.
- A recipe may start `FROM` another installed image instead, `python-data` say: its
  package's README gives the `FROM` row, and the recipe repeats the image's `REQUIRES HOST`
  rows (a FILE of the project's own script and a SLOP that runs it at build time, for
  example). `init` writes Pi's project only.
- Import `images`, `image` and `modules` from `OUT/index.mjs` as from an image
  package. Its modules are found in the packages under `node_modules/@daugasauron/`,
  so serve `OUT` beside them, from where it was built.
- An image is built for the installed versions: after the packages update, the
  rows' pins are others (`init` in an empty directory writes the new ones), and it
  is built again. Packages of two versions in one `node_modules` fail the build,
  naming both.

## Host modules

A host module is a directory with a `module.json`; its provider receives what it
needs from the runtime through the registry, and a device module imports
nothing outside its directory. `host/README.md` in the repository describes the
interface.
