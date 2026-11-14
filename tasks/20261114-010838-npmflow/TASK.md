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

- `test/npm-browser.mjs` at `e0e4ffacf`, in a network namespace with loopback alone: Chromium
  (Chrome 156) passed in 250.5 s, Firefox (Playwright's 155) in 457.7 s beside another build;
  requests beyond the machine: none. It follows `docs/npm.md`'s commands as written: `dolly-build`
  alone installed, `init my-pi git python nvim`, `add my-pi jq sqlite` (and NumPy and Matplotlib),
  a skill of the project's own with a script, the build (in Chromium without `--browser`), Pi
  listing both skills, Neovim writing a file, jq, SQLite, the figure, the saved session; the
  project committed and cloned, the workflow's `npm ci` and build lines run in the clone, the same
  site's files; a project made at `0.1.6-rc.0` moved to `0.1.6` by `add`, a lost pin written
  again; `--help` and a name that is no package. Before this branch every one of those steps
  failed (no `add`, no `nvim`, no `public/skills/`, no workflow, `init` without the packages).
- The stranger's pass after the fixes, from an empty directory (Chrome 156, headless): install
  0.4 s, `init` with its install 2 s, the build 45 s, the site 94 MB, `node_modules` 134 MB. Pi
  lists `changelog, csv-report, dolly`; the skill's script, `nvim`, `jq`, `sqlite3`, `git` and
  `python` run; `curl https://example.com` is refused (status 9).
- As CI (`build/npmflow-evidence/ci-run.sh`, `ci-run.log`): the project committed, cloned, `npm ci`
  (0.7 s from the loopback registry), then the workflow's build line with Playwright's
  `chromium_headless_shell-1243` in `unshare -rn` with loopback alone: the site, 91 MB, in 126 s
  beside the Firefox test. The workflow has not run on GitHub's runners.
- The source suite: 394 of 394.

Not measured: pnpm and Yarn with `init`'s own install (the manager is taken from
`npm_config_user_agent`; npm alone was run); the workflow on GitHub; Pi calling a model (below).

## The video

`sites/slopshare.dev/agents/videos/npm-pi-agent.mp4`, made in `work/videos-2026-11-14/npm/`
(README there). OpenRouter refused the key in `~/.openrouter` (401 "User not found", 13:23 JST),
so the take has no model: Pi lists the project's skill, and the skill's script is run by hand in
the sandbox's shell. With a working key in `~/.openrouter`, the take in which Pi uses the skill is

    cd /home/daug/dev/dolly/work/videos-2026-11-14/npm && bash retake.sh

(the registry on 127.0.0.1:9154 and Xvfb :154 must run; the script starts both if they do not).

## What is left

- The take with a model, once the owner renews the key.
- `demos/pi/data-pi` to 0.1.6 after 0.1.6 is published (above).
