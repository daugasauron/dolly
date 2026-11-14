# 0.1.7: npm installs again (a package name npm refused broke 0.1.6)

- STATUS: OPEN
- PRIORITY: 300
- TAGS: npm,release,0.1.7

## State (2026-11-15 02:00)

The fix and the version are on `release/0.1.7`; the 0.1.7 round builds and tests them. Left: the
round, the release checklist, the npm publish (the owner's approvals: npm takes no token from this
account, below), and a mouse-look check of Airtime in a browser.

## What happened

Publishing 0.1.6 (2026-11-15 00:48) in name order, npm refused
`@daugasauron/dolly-package-libdolly-download`: `400 Bad Request ... That word is not allowed`.
npm refuses a new name with the word "download"; it did so for `dolly-host-download` on 2026-10-30,
and `scripts/package-npm.mjs` named that host package `dolly-host-save`, but the library package
0.1.6 added got the plain name, and no test checked the generated names. Janis needs the library,
janis-install needs Janis, Pi needs janis-install and `dolly-build` needs Pi, all published by
then, so `npm install @daugasauron/dolly-build@0.1.6` failed with a 404. Measured fallout: npm's
`latest` for `dolly-build` was moved back to 0.1.5, and the five 0.1.6 versions that do not install
are deprecated with the reason.

Publishing also met npm/cli#9268: npm refuses this account's granular tokens with "bypass 2FA"
(E403 with 2FA off, EOTP with it on), also for never-published names. The publish works with 2FA
on and npm's browser sign-in, approved on the owner's phone (`work/release-0.1.6-npm-web.sh`).

## The fix

- `scripts/npm-names.mjs` names every npm package and says "save" for "download":
  `dolly-package-libdolly-save` beside `dolly-host-save`. `dolly-build` finds a package's image by
  its catalog and reads Pi's packages from `packages.json`, not from names.
- `scripts/package-npm.mjs` prints the tarballs each after those it depends on; the checklist
  keeps that order (`build/npm-vX.order`) and its publish command stops at a refusal.
- `test/npm-names.test.mjs`: every published name avoids the refused words, and no two collide.

## Done when

`npm install @daugasauron/dolly-build@0.1.7` and the npm guide's flow work from the registry, every
0.1.7 package on npm holds its tested tarball's bytes, and `latest` is 0.1.7.
