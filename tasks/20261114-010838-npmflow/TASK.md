# npm packages: a custom pi-agent made smooth (audit, fixes, docs/npm.md, changelog, video)

- STATUS: OPEN
- PRIORITY: 200
- TAGS: npm,0.1.6

The owner (2026-11-14):

> I want a complete audit etc using fable5.2 on how to use the npm packages. The use cases I
> imagine should already be documented, and some of the problems are there as well. I want it to
> be as smooth as possible to deploy a sandboxed customized pi-agent with tools of choice (python,
> nvim, git etc) and custom skills locally. The static bundle should be CI compatible in the
> easiest possible way. Create a video to demonstrate how to do this after it's complete. This
> will go in 0.1.6. I also want hte documentation to be updated (make the npm documentation a
> separate markdown, with links from the README). And a changelog of issues/fixes that are npm
> package specific.

Branch `feature/npm-0.1.6` (tree `work/npmflow`), from main `ee42c5982`. No seed input changed.

## State (2026-11-14)

See "What is left" at the end; everything above it is done and measured as stated.

## The flow now

```sh
npm init --yes
npm install @daugasauron/dolly-build
npx dolly-build init my-pi git python nvim     # installs what it names and lacks, writes the project
npx dolly-build Dollyfile-my-pi my-pi          # the image and the site, in the first browser found
python3 -m http.server -d my-pi -b 127.0.0.1 8080
npx dolly-build add my-pi jq sqlite            # later: more tools, or the pins after an update
```

Skills are directories under `public/skills/`; `.github/workflows/my-pi.yml` is the CI build.

## The audit: a stranger's pass over 0.1.6-rc as it was (10:05-10:20 JST)

From the tarballs `scripts/package-npm.mjs` packs at `ee42c5982`, served by a registry on
127.0.0.1:9154, in an empty directory outside the repository, following the README's "Pi with
npm" and `docs/embedding.md`.

| # | Friction | Fix |
| --- | --- | --- |
| 1 | Neovim, which the owner names, is no npm package: `init my-pi … nvim` answered `nvim is not installed: npm install @daugasauron/dolly-package-nvim`, a package that does not exist | `config/npm-images.txt` lists `nvim`, `jq`, `sqlite` and `less` (each stands alone: no package it installs) |
| 2 | The install line names nine packages; the user must know that `python` needs `dolly-host-sockets`; `init` stops at the first package that is not installed, one per run | `npm install @daugasauron/dolly-build` is the line. `init` and `add` install what they name and lack with the package manager that runs them (`npm_config_user_agent`: npm, pnpm, yarn), at `dolly-build`'s exact version, and print the command. The host modules of a package not yet installed come from `packages.json`, which `package-npm.mjs` writes into `dolly-build`. The owner's rule stands: no package depends on a host module |
| 3 | A name that is no package is answered as "not installed"; nothing lists the packages | `NAME: no such package. The packages: …` |
| 4 | A tool added after `init`: the row and its SHA-256 by hand; `init` refuses an existing project. After an update of the packages every pin is stale and the message sends the user to `init` in an empty directory | `dolly-build add NAME [PACKAGE…]`: installs, adds `INSTALL` and `REQUIRES HOST` rows, writes every `FROM`/`INSTALL` row at its installed pin, and installs at `dolly-build`'s version each Dolly package the project depends on at another. The build's pin message names it |
| 5 | A skill is `FILE` rows in the recipe, each line indented four spaces: a skill directory with scripts, as skills are shared, has to be pasted in | `public/skills/NAME/` is written into `~/.pi/agent/skills/` at boot by the page (`skills.json`, as `workspace.json`); a change keeps the image. `init`'s `changelog` skill is such a directory |
| 6 | CI: the README points to Data Pi's workflow in the repository; a project has none | `init` writes `.github/workflows/NAME.yml`: `npm ci`, Playwright's Chromium, the build, the Pages artifact; the deploy job as comments |
| 7 | `dolly-build --help`: a 12-line Node stack trace (`ERR_PARSE_ARGS_UNKNOWN_OPTION`) | The usage, three lines |
| 8 | The build wants Chrome unless told otherwise; without it Playwright's multi-line message | Without `--browser`: Chrome, then Playwright's Chromium, then its Firefox; none: one line with what to install |
| 9 | The build log says `the build reaches http://127.0.0.1:PORT`, its own server, beside the claim that nothing is fetched | That origin is not named |
| 10 | The npm guidance is spread over the README (a section and a table), `docs/embedding.md` ("Your own image") and `docs/agent-frontend.md` | `docs/npm.md`, which is also `dolly-build`'s README; the README keeps four commands and the links; `docs/npm-changelog.md` |

Seen and left:

- With `matplotlib` the build log ends with `dollyfile: 107 files under /usr/share/man are not
  kept: FOLDER /usr/share/man keeps them` and four more such lines. They are the recipe engine's
  (`programs/dollyfile.c`, a seed input), about files a package's install wrote; the image works.
- `demos/pi/data-pi` is a 0.1.5 project (`FROM pi-minimal`, `./dolly/src/browser.mjs`, a lockfile
  of npmjs tarballs). It moves to 0.1.6 once 0.1.6 is published: `npm install --save-exact
  @daugasauron/dolly-build@0.1.6`, `npx dolly-build add data-pi`, the import path, and its skills
  into `public/skills/`.

## Measured

To be filled in from the runs below.

## What is left

- The browser tests in both browsers, the CI-like run with Playwright's Chromium, the video.
