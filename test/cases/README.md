# Cases as data

What Dolly's userspace does, as JSON a host in any language runs: the browser
tests read these files, and another host runs the same cases against the same
images. Each file names the `image` its cases run in; `hosts` and `packages`,
where given, make it a recipe `FROM` that image (or from nothing, where a file
names no `image`) that declares those host modules as well and `INSTALL`s those
packages in order, each at the catalog's pin (`composed()` in `test/browser.mjs`
builds it so). A check that is a fact
of the page (a key press, a page reload, an HTTP policy, a Worker) stays in the
test's JavaScript.

- `slop.json`: independent cases of the shell. `files` are written into a
  directory first; each case's `script` is written to `fixture-zero` there and
  `/bin/slop fixture-zero` exits with `status`. `bash` is Bash's status where it
  differs (`test/slop.test.mjs` runs Bash as the reference). `shell` cases use
  builtins alone, `command`, `pipeline` and `exec` cases start programs.
- The others (`shell.json`, `toolchain.json`, `process.json`, `cpp.json`,
  `cpp-dso.json`, `pty.json`, `man.json`, `default.json`, `cc-package.json`,
  `zig-package.json`, `sockets.json`, `sockets-undeclared.json`, `fs-growth.json`, `host-modules.json`, `touch.json`, `pager.json`,
  `amy-programs.json`, `amy-tools.json`, and each demo's `demos/DEMO/test/amy-cases.json`,
  its packages'): steps in order in one `directory`, made where it is absent, which first gets `files`
  (their text) and `fixtures` (each named by its path in this repository). Each step's `script` runs as
  `/bin/slop -c SCRIPT` there and exits with `status`, or with any nonzero
  status where `fails` is true. Steps share files, not shell state; `terminal`
  marks a step whose standard input must be a terminal. `fresh` marks a step
  that may begin a new session of the image: from it to the next such step,
  one package installs and is used in a session that held none of the others.

`why` says what a case is for, where its name does not.
