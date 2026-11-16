# Release steps 4 to 8 are rewritten in work/ each release: the checklist prints commands that do not work as printed

- STATUS: OPEN
- PRIORITY: 170
- TAGS: audit,repo,release,deployment,0.1.8

## State (2026-11-16)

Filed by the repo audit; nothing done.

## Found

`scripts/release-checklist.sh` ends by printing the commands of steps 4 to 8 "for the owner to
run" (`:73-90`). Neither of the last two releases ran them as printed. Each was released by new
scripts in `work/`: 0.1.6 by 12 (729 lines), 0.1.7 by 9 (558 lines, `work/release-0.1.7*.sh`).
Where the printed command does not work, or a step is missing from it:

- npm (step 5). The printed `npm publish "${tarball}" --access public` fails for this account:
  "npm refuses this account's bypass 2FA tokens (npm/cli#9268)" (`work/release-0.1.7-npm-web.sh:5`).
  The release used `--auth-type=web` with a sign-in per publish, resumed past packages already
  published, and then checked that the registry holds the tested bytes (`npm view NAME@VERSION
  dist.integrity` against each tarball's SHA-512, `:77-84`). That last check is the only proof the
  published packages are the tested ones, and it exists only in `work/`. The script was copied from
  0.1.6's `release-0.1.6-npm-web.sh`, with 0.1.6's `-npm.sh`, `-npm-otp.sh` and `-npm-latest.sh`
  before it.
- The deployment (step 6). The printed `npx wrangler@4.129.1 pages deploy` has no account. The
  release reads `CLOUDFLARE_ACCOUNT_ID` from `work/release-0.1.6-cloudflare-account` and the token
  from `~/.cloudflare` (`work/release-0.1.7.sh:105-106`).
- The archive (steps 1 and 8). 0.1.6's step 8 was never run: 0.1.7's script archived v0.1.6
  itself, from `build/pages-v0.1.6-core`, before running the checklist (`work/release-0.1.7.sh:41-44`).
  It also retired v0.1.4 by `mv` (`:45`). The checklist needs the archive complete before it runs,
  and nothing checks that the newest published version is in it. Without that `cp`, step 6 would
  have assembled a deployment without v0.1.6, and so removed it from the site ("a deployment
  assembled without a version removes that version", `docs/deployment.md`). The local and live
  boots take their versions from that same deployment (`scripts/release-checklist.sh:71`), so
  they would not have noticed. (Read from the scripts; not run.)
- The version bump (step 8). The printed step names `package.json` and `page/version.mjs`. The bump
  to 0.1.7 (`653727235`) also rewrote the site references of 229 Dollyfiles to the new version, as
  `scripts/update-recipe-pins.mjs` writes them. It also moved `package-lock.json`, and the version
  named in `README.md:132` and in `AGENTS.md`'s tag example. The seed compiler's URL
  moved in a separate commit after the round (`9c589654e`). What the bump costs, and whether
  recipes should name the version at all, is `tasks/20261116-140453-buildtime-01`.

This departs from "Development iteration speed is king". A release step that exists only in
`work/` is found again at the next release, as 0.1.6's npm scripts were.

## Do

- The checklist prints the commands that work. Step 5 publishes with `--auth-type=web` in
  `build/npm-vX.Y.Z.order`'s order and skips a package already at the version. A script in
  `scripts/` checks every listed tarball's integrity against the registry, and the checklist names
  it. Step 6 says where the account comes from (an environment variable the owner sets).
- Step 1 fails unless the archive holds every version the live site serves. Each version on the
  root's `robots.txt` lines must have a directory in the archive.
- Step 8 names every file and command of the bump, in whatever form
  `tasks/20261116-140453-buildtime-01` leaves it.

## Done when

0.1.8 is released with the checklist's printed commands and no `work/` script beyond the machine's
own lines (credentials, the unit).
