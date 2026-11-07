# Data Pi

A static site that runs the [Pi](https://github.com/earendil-works/pi) coding
agent in a browser tab, in a [Dolly](https://slopshare.dev) sandbox with Python,
NumPy, pandas and Matplotlib, a sample dataset and three skills of its own.
The agent's requests reach the model's provider and nowhere else. This
directory is a project of its own, built from the npm packages: copy it into a
repository to start one.

- [`Dollyfile-data-pi`](Dollyfile-data-pi): the image. Pi from npm's `pi-minimal`
  image, the three Python packages, the agent's instructions and its skills:
  `explore-data` (with its profiling script), `chart` and `report`.
- [`public/`](public): the page, Pi's colours (`theme.json`) and `workspace/`,
  the project the page writes into `/workspace` at boot.
- [`.github/workflows/build.yml`](.github/workflows/build.yml): builds the site
  and publishes it on GitHub Pages. Elsewhere, a CI job in Playwright's image
  (`mcr.microsoft.com/playwright:v1.63.0-noble`, the version of `playwright-core`
  in the lockfile) needs only `npm ci` to reach the network, then runs
  `npm run browser` and `npm run build` and keeps `site/`.

## Build and run

With Node.js 22 and Python:

```sh
npm ci
npm run browser  # Playwright's headless Chromium, the version its lockfile pins
npm run build    # the image and the site, in that browser, into site/
npm start        # serves site/ on http://127.0.0.1:8080/
```

The browser comes from Playwright's download host, not from npm;
`PLAYWRIGHT_DOWNLOAD_HOST` points it at a mirror. On a bare Linux machine,
`npx playwright-core install-deps chromium-headless-shell` installs the system
libraries it needs.

Pi asks for an OpenRouter key at a prompt that does not show it. Ask it, for
example, "explore the sales data, chart revenue per region over the year and
write a report". Ctrl+D leaves Pi for a shell. Save (Ctrl+Shift+S) keeps the
session in this browser.

A change to `public/` alone rebuilds in seconds: the build keeps the image.
