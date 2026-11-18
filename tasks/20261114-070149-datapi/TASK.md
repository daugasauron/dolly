# Data Pi to the published 0.1.8 packages

- STATUS: OPEN
- PRIORITY: 120
- TAGS: npm,demo

## State (2026-11-18): waits for 0.1.8 on npm

The move now goes to 0.1.8, the version whose recipes declare their requests
(`tasks/20261118-223405-image-network`): then Data Pi also takes `init`'s `HTTP` rows in place of
its page's policy, and starts Pi plain (no `pi-key` line, no `models.json`), as `init`'s template
does. 0.1.7's parser refuses those rows, so the project waits for 0.1.8's tarballs on npmjs for its
lockfile; until then it stays the 0.1.5 project below, which asks for an OpenRouter key.

## Before (2026-11-16, the audit)

The task waited for 0.1.6 on npm. 0.1.6 was published but does not install: npm marks every 0.1.6
package deprecated, "0.1.6 does not install: npm refuses the name of a package it needs
(@daugasauron/dolly-package-libdolly-download). Use 0.1.5 until 0.1.7". 0.1.7 is published
(`npm view @daugasauron/dolly-build versions`: 0.1.5, 0.1.6, 0.1.7). So the move goes to 0.1.7, and
`docs/npm-upgrading.md` describes the 0.1.5-to-0.1.7 path it follows.

`demos/pi/data-pi` is still the 0.1.5 project. Its `package.json` names eleven 0.1.5 packages, among
them `dolly-host-save`. Its recipe starts `FROM pi-minimal`, its page imports `./dolly/src/browser.mjs`,
its skills are `FILE` rows, and its lockfile names npmjs's 0.1.5 tarballs. From
`tasks/20261114-010838-npmflow`.

## Do

In `demos/pi/data-pi`:

    npm install --save-exact @daugasauron/dolly-build@0.1.8
    npx dolly-build add data-pi

then the page's import (`./dolly/page/browser.mjs`), the three skills as directories of
`public/skills/` with `init`'s `main.mjs` lines that write them, and the workflow as `init` writes it.

## Done when

`npm ci`, `npm run browser` and `npm run build` in a clean copy of the directory write the site, and Pi
starts in it with the three skills (`npm run test:demos -- pi`).
