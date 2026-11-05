# Publish dolly-package-git, -python and -cc with 0.1.5

- STATUS: OPEN
- PRIORITY: 80
- TAGS: npm,packaging,release,0.1.5,owner

`scripts/package-npm.mjs` packs `@daugasauron/dolly-package-git`, `-python` and `-cc` (3.4, 51 and
35 MB), which `dolly-build init my-pi git cc` installs from
(`tasks/20261102-133357-npm-agent-sandbox`, closed 2026-11-03). They are not on npm, so the
README's path runs only from packed tarballs.

Owner (2026-11-04): "leave it until next version, 0.1.5." Publishing is the owner's step at that
release; no agent publishes. From 0.1.6 the images and packages on npm are the list
`config/npm-images.txt` (`tasks/20261105-213000-npm-offline`), which adds `libffi` and Python's
data libraries as packages and packs each package with its own snapshot alone.

Done when: the three packages are on npm at 0.1.5 by the release checklist's npm step, run by the
owner; `npm install @daugasauron/dolly-package-git@0.1.5` resolves; `test/npm-browser.mjs`'s path
runs from the registry's packages, not packed tarballs, in Chromium and Firefox.
