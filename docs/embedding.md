# Embedding Dolly

Dolly is a POSIX-like userspace for wasm64 that runs in a browser tab: a Wasm
kernel, programs in private Wasm memories, and host modules that bridge it to
the browser. These npm packages put it in a page of your own. Their first use is
an agent in place of a web frontend (`docs/agent-frontend.md` in the repository).

| Package | What it holds |
| --- | --- |
| `@daugasauron/dolly` | The runtime: `boot()`, the kernel, the process runtime, and the host modules that are its own machinery (`runtime`, `http`, `threads`, `dso`, `stack`, `nena`, `snapshot`, `packages`). Building images stays with Dolly's site |
| `@daugasauron/dolly-host-NAME` | One device host module each: `display` (Ghostty's terminal and programs' frames), `input`, `gpu`, `audio`, `microphone`, `touch`, `download` (as `dolly-host-save`: npm takes no new name with the word), `upload`, `sockets`, `pty` |
| `@daugasauron/dolly-image-default` | The `default` image alone: a shell, its text tools, the terminal, curl, `amy`, `nena`, `ps`. `amy` lists what is installed and has nothing more to install |

```sh
npm install @daugasauron/dolly @daugasauron/dolly-image-default \
  @daugasauron/dolly-host-display @daugasauron/dolly-host-input @daugasauron/dolly-host-audio \
  @daugasauron/dolly-host-touch @daugasauron/dolly-host-save @daugasauron/dolly-host-upload \
  @daugasauron/dolly-host-sockets
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
shows its own failure in the element.

| Option | Meaning |
| --- | --- |
| `images` | URL of an image directory: `dist/dolly-images.mjs`, the images' metadata and packs, their recipes. `@daugasauron/dolly-image-default`'s `index.mjs` exports its own. A page has one image directory |
| `image` | The image to run, by name |
| `modules` | URLs of the `module.json` of each host module the page has. The registry loads these and no other; an image's `REQUIRES HOST` must be among them |
| `site` | Optional: the URL of a site that serves Dolly's own pages (`session/`, `sessions/`, `docs/`), as Dolly's site does. Given, a saved session names itself in the tab's URL and modules link to those pages |
| `http` | Optional `{ policy, relays }` for the HTTP broker, the page's one network edge (docs/http.md). Without a policy a program may fetch any HTTPS URL |

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

## Serving

- Serve the installed packages as they lie: the runtime finds its own files
  beside itself, and `dolly-image-default`'s `index.mjs` finds the modules in the
  packages installed beside it under `node_modules/@daugasauron/`.
- Send `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` with the page: Dolly needs shared
  memory, which a browser gives only to a cross-origin isolated page.
- Serve `.wasm` as `application/wasm` and `.mjs` as `text/javascript`.
- No bundler is needed: these are ES modules, Workers and Wasm files.

## Host modules

A host module is a directory with a `module.json`; its provider receives what it
needs from the runtime through the registry, and a device module imports
nothing outside its directory. `host/README.md` in the repository describes the
interface.
