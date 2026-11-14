# Data Pi to the published 0.1.6 packages

- STATUS: OPEN
- PRIORITY: 120
- TAGS: npm,demo

## State (2026-11-14): waits for 0.1.6 on npm

`demos/pi/data-pi` is a 0.1.5 project: its recipe starts `FROM pi-minimal`, its page imports
`./dolly/src/browser.mjs`, its skills are `FILE` rows, and its lockfile names npmjs's 0.1.5 tarballs.
Its lockfile can only name 0.1.6 once 0.1.6 is published. From
`tasks/20261114-010838-npmflow`.

## Do

In `demos/pi/data-pi`, after the release:

    npm install --save-exact @daugasauron/dolly-build@0.1.6
    npx dolly-build add data-pi

then the page's import (`./dolly/page/browser.mjs`), the three skills as directories of
`public/skills/` with `init`'s `main.mjs` lines that write them, and the workflow as `init` writes it.

## Done when

`npm ci`, `npm run browser` and `npm run build` in a clean copy of the directory write the site, and Pi
starts in it with the three skills (`npm run test:demos -- pi`).
