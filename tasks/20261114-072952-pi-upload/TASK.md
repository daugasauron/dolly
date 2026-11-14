# Pi asks the user to upload a file: an upload tool in pi-dolly

- STATUS: OPEN
- PRIORITY: 220
- TAGS: pi,upload,0.1.6

The owner, 2026-11-14: "the pi agent image (and package) that has dolly specific instructions
should be able to ask the user to upload a file, meaning a specific tool that triggers the file
upload."

## State (2026-11-14)

Branch `feature/pi-upload` in `work/piupload` (the compiler round with `feature/npm-0.1.6`).
Done and measured: the tool, the recipes, the prompt and skill, the Pi test in Chromium and
Firefox, `dolly-build add` declaring a package's new host modules, `test/npm-browser.mjs` in
both. Rebuilt here: pi-dolly, pi-runtime, pi-minimal, pi-agent, python-data (and seaborn),
dollyfile-studio, classicube and classicube-agent. For the release round, which rebuilds them
for the seed anyway: pi-local, pi-phone, slopyard, rts-arena and seven-kingdoms (FROM
pi-runtime). The npm docs (`docs/npm*.md`, another branch's) need the lines in the report.

## Measured

- `demos/pi/test/ask-user-browser.mjs` before the change, on the round's pi-runtime, Chrome:
  fails at the upload step, Pi answering "Tool upload not found"
  (`build/piupload-evidence/before-chromium.log`).
- After, on pi-dolly `d8f91a75…` and pi-runtime rebuilt (227 s for both): Chrome passed in
  37.0 s, Firefox (Playwright's) in 40.8 s. The test picks the file through the browser's
  picker (Playwright's `filechooser` after a click on the dialog's input): 3000 bytes of every
  byte value arrive at `/workspace/data/sales.csv` (sha256 checked in the shell), the model gets
  `{"path":"/workspace/data/sales.csv","size":3000}`; the dialog's Cancel reaches the model as
  "The user cancelled the upload." and leaves nothing in `/workspace`.
- What the user sees: `build/piupload-evidence/dialog.png`, the page's dialog over Pi, with
  `upload reason="The sales figures to chart" path="data/sales.csv"` readable beneath it.
- `test/npm-browser.mjs` (packed from this tree, offline namespace): Chrome passed in 271.8 s,
  Firefox in 239.2 s; requests beyond the machine: none. New in it: init's recipe declares
  `upload@0`; in the Pi site's shell `upload /tmp/chosen` shows the dialog and Escape cancels it
  (status 1); the older project, without `upload@0` and `dolly-host-upload` as one of 0.1.5,
  gets both back from `add`. With the old `add` it fails there: the recipe lacks
  `REQUIRES HOST upload@0` (`build/piupload-evidence/npm-browser-old-add.log`).
- Builds (`DOLLY_IMAGE_JOBS=1`, build slot): pi-dolly and pi-runtime 227 s; pi-minimal,
  pi-agent, python-data and seaborn 161 s; dollyfile-studio, classicube-agent and classicube
  131 s.
- The source suite: 393 of 394; `process-sysroot.test.mjs` needs `build/rdynamic.exports`, an
  output of `npm run build:runtime`, which this tree does not run (the brief).

## Design

- `upload` is a Pi tool in `demos/pi/dolly-tools.js`, beside `download`: `reason` (required) and
  `path` (optional, relative to the session's cwd; default `upload-N` there, the first free N).
  It creates the path's directory, runs the `upload` command (the transfer package, `upload@0`)
  and waits for it: the page's dialog, the user's choice in the browser's picker or Cancel.
  It returns `{"path", "size"}` (the browser does not pass on the file's name), or "The user
  cancelled the upload."; another failure (an existing path, `upload@0` missing) is the tool's
  error with the command's message. An abort of the tool (Ctrl+C in Pi) kills the command,
  which closes the dialog. `model-only` and sequential, as `ask_user`.
- The reason is shown in Pi's transcript (the call's arguments), on the terminal beneath the
  dialog's backdrop. It does not reach the dialog: upload@0 carries no text to the page
  (`dolly-upload-0.wat`: no path, filename or other data crosses), and changing that is a
  change of the contract and of its client, a seed input. Not wanted for this.
- Cancel is told from other failures by the command's stderr, the C library's message for
  ECANCELED ("Operation canceled"): `upload` exits 1 for every failure, and changing
  `Dollyfile-transfer` would rebuild `system` and every image on it.
- No new browser authority: the tool is a process that runs an existing command over an
  existing module; the picker opens only on the user's click in the dialog.
- `pi-dolly` installs `transfer` (the `upload` and `download` commands) and declares
  `upload@0`; `pi-minimal` declares it too (it had no `upload`); every other image that
  installs pi-dolly already had both. npm: `transfer` is listed in `config/npm-images.txt`
  (pi-dolly installs it), and `dolly-build init` declares `upload@0` and installs
  `@daugasauron/dolly-host-upload` without a change of its own, from pi-dolly's host modules.
- A project of 0.1.5 has no `upload@0` row, and after `dolly-build add` moved its pins the
  build refused pi-dolly (`site/dollyfile-graph.mjs`: "needs REQUIRES HOST upload@0"). `add`
  now declares the host modules of every package the recipe installs at its new pin, and
  installs their host packages, so the upgrade guide's `npx dolly-build add my-pi` moves it.
- Not changed: `Dollyfile-pi`'s manual page says pi-dolly adds "a download tool"; true still,
  and a change would rebuild `pi` and everything on it for one word.

## Done when

- `demos/pi/test/ask-user-browser.mjs` (Pi driven by a scripted model) passes in Chromium and
  Firefox: a file chosen in the browser's picker arrives byte for byte at the path the model
  named, the model gets its path and size, and a cancel reaches the model as a cancel.
- It failed before the change (the tool did not exist).
- pi-dolly and the images that install it are rebuilt, or listed for the release round.
