# npm: installed packages to a static site of one's own, with nothing fetched after npm install

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: npm,packaging,0.1.5

The owner, 2026-11-05:

> It should be possible to serve an image based on the pi image, with additional python, numpy &
> matplotlib from the preinstalled npm package, build a new custom image based on these using the
> build image, and then package something that can be served statically. The ONLY point during this
> flow where external/public data is downloaded is during the npm install stage, after that there
> should be NO requests sent to the public internet or anything external.

> This is just an example, the soluition should be generic.

The integrator moved it from 0.1.5 to 0.1.6 (2026-11-05 22:10); the owner (2026-11-06 07:00):
"That SHOULD be a part of 0.1.5". Merged into `integrate/2026-11-05` at `12d3164de`.

## State (2026-11-06 10:30): closed, released in v0.1.5-rc.0

Merged at `12d3164de`; v0.1.5-rc.0 is `fcfe756f1`. The round's npm suite passed in Chromium
(110.4 s) and Firefox (87.0 s). The 25 packages packed at 0.1.5-rc.0 passed the same test as
tarballs (`work/rc-npm-1106.sh`, `build/round-1106rc-evidence/npm-rc-offline.log`): Chromium
115.9 s, Firefox 95.1 s; requests beyond the machine: none. Published under `rc` and `latest`,
each registry integrity the tested tarball's (`build/npm-publish-1106.log`). From npmjs.com, the
README's install line in an empty app added 16 packages at 0.1.5-rc.0 in 19 s, and `npx
dolly-build init my-pi git python numpy matplotlib` and the build, in a network namespace with
only loopback, wrote a 99 MB site in 43 s.

## Merge notes

- `git merge-tree` against `integrate/2026-11-05` at 15929916a: no conflicts (README.md changed
  on both sides, apart). Integrate's repins (dolly-docs and its dependents) touch no recipe of
  this branch, and this branch's pins (python, python-data-build) are integrate's.
- Images: `numpy`, `python-dateutil`, `pandas`, `matplotlib`, `seaborn` (new, COPYs of
  python-data-build, under a minute each) and `python-data` (rebuilt); nothing is built on
  python-data. No seed, runtime or page change: `dist/` runtime files are as they were.
- `test/npm-browser.mjs` needs `unshare` with user and network namespaces, `ip`, `iptables`,
  `ip6tables` and `python3` on the machine that runs it (the release checklist's step 3).
- For 0.1.5's notes: a 0.1.4 `dolly-build` project moves `index.html`, `theme.json` and
  `workspace/` into `public/`, imports `./dolly/src/browser.mjs` and `./image/index.mjs` with
  init's isolation lines, drops `serve.mjs`, and removes its old image directory once.

## The flow as a user runs it

```sh
npm init --yes
npm install @daugasauron/dolly @daugasauron/dolly-image-pi-minimal @daugasauron/dolly-build \
  @daugasauron/dolly-host-display @daugasauron/dolly-host-input @daugasauron/dolly-host-save \
  @daugasauron/dolly-host-html @daugasauron/dolly-host-sockets \
  @daugasauron/dolly-package-git @daugasauron/dolly-package-matplotlib
npx dolly-build init my-pi git python numpy matplotlib
npx dolly-build Dollyfile-my-pi my-pi
python3 -m http.server -d my-pi -b 127.0.0.1 8080
```

`my-pi/` is the site: `public/`'s files, `workspace.json`, `dolly/` (the runtime), the five
device modules the recipe declares, `coi-serviceworker.js` and `image/` (96 MB of packs).

## Decisions

From the integrator's brief (2026-11-05):

- Libraries become packages, extracted from python-data-build's roots, their dependencies as
  `INSTALL`s; python-data installs them.
- npm packaging is generic: the published set is one config list; descriptions come from where
  amy-index.txt's do; each directory carries an amy-index.txt and every file its pages fetch.
- dolly-build's result can be served statically, with the isolation a header-less host needs.
- The proof is a test of the whole flow in Chromium and Firefox that records every request
  beyond the machine and asserts the record is empty.

Mine:

- Granularity: five packages, cut where the dependency graph shares a node. `numpy`;
  `python-dateutil` (with tzdata), which pandas and Matplotlib both need; `pandas` with what it
  reads and writes besides CSV (Jinja and MarkupSafe, openpyxl and et-xmlfile, tabulate), which
  only it uses; `matplotlib` with Pillow, kiwisolver, contourpy, cycler, fontTools, pyparsing and
  packaging, which only it uses here; `seaborn`. Each `INSTALL`s what it needs (`python`, `numpy`,
  `python-dateutil`, `pandas`, `matplotlib`), so `amy install matplotlib` and one `INSTALL` row
  bring a library with what it needs. Names are PyPI's, which is what a person types. One package
  per root (18) would list pure-Python helpers no one installs alone.
- npm packages depend on the packages they install. A package's directory carries its own
  packs alone, and its package.json depends on `dolly-package-X` for each `INSTALL` row of its
  recipe, at the same version; `config/npm-images.txt` must list them (package-npm.mjs fails
  naming the one it lacks, so `libffi` is listed). Measured on the packs: self-contained, as
  before, `python` was 51.0 MB (python 15.5 + cc 35.4 + libffi 0.1) and each Python library
  would carry it again (numpy 56.1, matplotlib 67.4, seaborn 75.6); the owner's example
  (python, numpy, matplotlib) installs 174 MB, 67 MB of it once. With dependencies each pack is
  installed once, and `npm install @daugasauron/dolly-package-matplotlib` brings numpy,
  python-dateutil, python, libffi and cc. dolly-build finds the installed directories in
  `node_modules/@daugasauron/` and beside each one's real path (pnpm keeps a package's
  dependencies there), and serves every installed directory's packs to the build. The owner's
  rule of 2026-10-25 (an image and a host module depend on the runtime alone; an image does not
  depend on its host modules) stands: images still depend on the runtime alone.
- amy-index.txt of a directory lists the packages its image holds (its record's `INSTALL` rows,
  theirs, and, but in a package, its base's), with a package's own line in a package directory.
  `amy list` in an npm image then shows what it holds as installed; it can install nothing new,
  since a page has one image directory, which carries its image's packs alone. dolly-build writes
  the site's from the installed directories' indexes, so a description travels with its package.
  The site's index (generate-routes.mjs) and these share one writer (`amyIndex`, image-directory.mjs).
- dolly-build's result is a site: `dolly-build Dollyfile-NAME OUT` writes it, the default output,
  no flag. `init` writes the page's files into `public/` (index.html, theme.json, workspace/); OUT
  is `public/`'s files, `workspace.json`, the runtime package as `dolly/`, the declared device
  modules as `dolly-host-NAME/`, `coi-serviceworker.js` (now in the runtime package) and `image/`.
  The page registers the service worker when it is not isolated and loads again, once, as the
  site's terminal.html does; boot() reports a page that is still not isolated. init's serve.mjs is
  gone: the site needs no server of its own, and Python's `http.server` serves it in the README.
  Its relay is a route of the user's own server (docs/agent-frontend.md); a static host relays nothing.
- A build whose `image/` already holds this recipe at its pin, built by the installed runtime's
  build identities, keeps it: a change to `public/` alone is a build of seconds.
- The proof runs the whole test in a network namespace (`unshare -rn`): loopback up, every other
  IPv4 and IPv6 address local (`ip route add local default dev lo`), and each TCP and UDP packet
  to one redirected by iptables to port 9, where the test records the connection's TLS server name
  or HTTP host; DNS at 127.0.0.53 answers NXDOMAIN and records the name. The test then runs again
  as the user (a second user namespace mapping the uid back: Chrome refuses to run as root). It
  first checks the recorder sees a fetch by name and one by address, then asserts the record is
  empty at the end. Everything of the flow after packing runs in it: npm install from the test's
  registry, init, build (Node and its browser), the static server and the pages.

## Evidence

Under `build/npmflow-evidence/` in `work/npmflow`.

- Images (`image-1.log`, 243 s, one build slot): `numpy`, `python-dateutil`, `pandas`,
  `matplotlib`, `seaborn` new (snapshots 22.7, 1.2, 40.3, 34.6 and 1.3 MB), `python-data` rebuilt.
  Its manifest against the candidate's (`work/integrate/dist`): the same 8830 paths and five more,
  the packages' recipes under `/etc/dolly/recipes/`.
- The packages, `package-npm.mjs` before (`pack0/`, the candidate's script) and after (`pack1/`):
  `python` 51.1 → 15.8 MB, the rest the same (runtime 0.2, `default` 5.5, `pi-minimal` 26.4,
  `python-data` 80.7, `cc` 35.3, `git` 2.2); new `libffi` 0.2, `numpy` 5.5, `python-dateutil` 0.7,
  `pandas` 8.3, `matplotlib` 11.2, `seaborn` 0.7. The README's install line comes to about 98 MB.
- By hand first (`app1/`, `site1/`): the site built in 50 s, 97 MB; `python3 -m http.server`
  served it with no isolation headers, the page isolated itself through `coi-serviceworker.js`
  in Chrome and Firefox, Pi started, Python drew with NumPy and Matplotlib, and the server
  logged no 404.
- What a browser asks for by itself, in the namespace, 40 s on a page with a text field
  (`scratchpad/chrome-probe.mjs`): Chrome (channel chrome, Playwright's switches, which include
  `--disable-background-networking` and `--disable-component-update`) resolved
  `content-autofill.googleapis.com` (112 times), `www.google.com` (105), `update.googleapis.com`
  (35), `www.gstatic.com` (14) and `clients2.google.com` (7); Firefox `aus5.mozilla.org`, its system
  add-on updater (`extensions.systemAddon.update.enabled` false stops it;
  `app.update.disabledForTesting` and `media.gmp-manager.updateEnabled` do not). Behind an HTTP
  proxy that refuses everything, Chrome sends nothing past it; Firefox still resolves `aus5` until
  the pref is off. So `dolly-build` launches its browser behind such a proxy of its own, bypassed
  for 127.0.0.1 and the recipes' `SOURCE` hosts, and Firefox with that pref.
- `npm-3.log` (Chromium, before the proxy): the flow passed in 139 s and the record held 1,267
  DNS queries, all of those five Google hosts: the finding above, from dolly-build's Chrome and
  the test's.
- `npm-2.log`: the data project's build crashed its tab: the scope's OOM killer (6 GB), since
  the test kept every page's session open; it closes each when done.
- `npm-4.log` (`npm-both-pass-1.log`): Chromium passed in 135.3 s, Firefox in 116.9 s; requests
  beyond the machine: none. The test browsers' own, refused at their proxy: `clients2.google.com`,
  `content-autofill.googleapis.com`, `update.googleapis.com`, `www.google.com`, `www.gstatic.com`
  (Chrome); none from Firefox. The test then did not exit: `sh -c` left Python's server
  running, holding its pipes; it now `exec`s the README's command.
- `python-data-pass-1.log`: `python-data` in Chromium (19.1 s) and Firefox (20.4 s), `openblas`
  in both, and `amy install numpy` into `default` (6.4 s, Chromium), which imports NumPy and not
  pandas.
- `core-1.log`: `test/core-browser.mjs` (generate-routes.mjs and image-directory.mjs changed)
  passed in Chromium (22.1 s) and Firefox (30.8 s).
- pnpm 12.16.1, by hand (`pnpm-app/`, `pnpm-build.log`): the README's install line from a
  registry of the packed packages puts only the ten named packages in `node_modules/@daugasauron/`
  (numpy, python-dateutil, python, libffi and cc sit beside matplotlib's and python's real paths
  under `.pnpm/`); `init my-pi git python numpy matplotlib` and the build found them, and the
  site booted in Chrome from Python's server: Pi, then NumPy and Matplotlib, no 404.
- `npm-5.log`, with that: Chromium passed in 115.7 s, Firefox in 92.1 s, the record empty, the
  same five Google hosts refused at the test browsers' proxy, and the test exited.

- `npm-6.log` (`npm-both-pass-head.log`), at b6dd82384: Chromium passed in 114.0 s, Firefox in
  88.2 s; requests beyond the machine: none.

## Lessons

- An empty record proves nothing until the recorder has been seen to record: the test fetches a
  name and an address first and checks both are noted. The first full run then caught what no
  page-level check would have: Google Chrome, with Playwright's own "no background networking"
  switches, still asks five Google hosts for updates, the clock and autofill.
- A browser's own traffic is the vendor's, and switches chase it version by version; a proxy
  that refuses everything but loopback ends it in one place. Firefox resolves names for one
  updater even behind a proxy, which only a namespace-level recorder showed.
- A test that keeps every page open runs out of a 6 GB scope once an image grows: close each
  page when its checks end. And `spawn("sh", ["-c", command])` leaves the command running after
  the kill; `exec` it.
