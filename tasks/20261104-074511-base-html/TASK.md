# default and system install the html package

- STATUS: OPEN
- PRIORITY: 140
- TAGS: images,html,packages

`html@0` is a package (`Dollyfile-html`; `tasks/20261101-124237-html-popups`, closed). `default`
declares every module the packages amy installs may need (`Dollyfile:6-16`: audio, dso, http,
nena, packages, snapshot, sockets, threads, touch, upload, "for the packages amy installs") but
not `html@0`, so `amy install pi-dolly` in `default` needs `nena enable html` first (71d2603fc),
and a shell user has no `html` command. `system` likewise.

Decided 2026-11-04 (`tasks/20261102-133353-owner-decisions`): yes. The rule `default` already
follows gives `html@0`; the `html` command is one small program; the popup grants nothing
(`docs/browser-boundary.md`'s html@0 row). A base change: a round.

Done when: `Dollyfile` and `Dollyfile-system` declare `REQUIRES HOST html@0` and install the
`html` package; in `default`, `html` of a one-field form shows the popup and prints the field, in
Chromium and Firefox; `amy install pi-dolly` works without `nena enable html` and the note that
says so is gone; `test/default-browser.mjs` and `test/html-browser.mjs` pass in both browsers on
the round's images.
