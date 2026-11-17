# gpu-explicit never ran in Firefox: the round gave the snap no TMPDIR, and the release notes blame systemd

- STATUS: CLOSED
- PRIORITY: 240
- TAGS: audit,repo,tests,gpu,firefox,0.1.8

## State (2026-11-17)

Closed: see the closing section.

## Found

`test/gpu-explicit-browser.mjs firefox` timed out at launch in every round since 2026-11-13:
`round-1113c`, `round-1114`, `round-1115` and `round-1117` in `work/round1113/build/` and
`work/donna-rc0/build/`. Each time the log says `browserType.launch: Timeout 180000ms exceeded`
after `<launching> /snap/bin/firefox ... --profile /tmp/playwright_firefoxdev_profile-…`.
Those rounds explained it as "the installed Firefox snap does not start in a systemd unit" and
dropped the failure from their verdict (`work/round-1117.sh:74`). The explanation was then
copied into `tasks/20261112-074511-gpu-provider-review`, `tasks/20261112-074507-page-providers` and
v0.1.7's release notes ("The GPU contract tests ran in Chrome alone: the installed Firefox snap does
not start in a systemd unit on the test machine").

That is not the cause. `docs/gpu.md:115-116` gives it: "A snap's Firefox has a /tmp of its own, so
Playwright's profile must be elsewhere: set `TMPDIR` to a directory under `$HOME`". The same rounds
set `TMPDIR=/home/daug/dev/dolly-tmp` for the Godot and PhotoCraft GPU tests, whose Firefox runs
passed in the same units, and did not set it for `gpu-explicit`.

Measured on 2026-11-16, outside a unit, on `DISPLAY=:148` under the GPU lock
(`work/audit-1116-evidence/repo/`):
- `firefox-launch.mjs` (gpu-explicit's launch alone): with `TMPDIR` unset, "Timeout 60000ms
  exceeded"; with `TMPDIR` under `$HOME`, Firefox 159.0.1 started in 1.4 s (`firefox-launch.log`).
- `test/gpu-explicit-browser.mjs firefox` on 0.1.7's catalog (`work/round1113`, read only) with
  `TMPDIR` under `$HOME`: "firefox GPU explicit records PASS", exit 0
  (`gpu-explicit-firefox-tmpdir.log`).

It had passed by hand once already, after 0.1.7's release, in another tree:
`work/flyover4/build/flyover4/out-gputests.txt` (2026-11-15 17:14) reads "test/gpu-explicit-browser.mjs
firefox: exit 0 firefox GPU explicit records PASS". No release has had that run. 0.1.6 and 0.1.7
shipped without it, and 0.1.7's release notes name a limit of the test machine that does not exist.

Eight tests launch the installed Firefox and leave `TMPDIR` to whoever runs them:
`test/gpu-explicit-browser.mjs`, `test/gpu-render-browser.mjs`, four of `demos/godot/test/`
(`godot-gpu`, `godot-projects`, `godot-x11`, `godot-flyover`) and both of `demos/photocraft/test/`.
Three set it themselves (`demos/mojo/test/mojo-browser.mjs:22`,
`demos/mojo/target/test/mojo-target-browser.mjs:25`, `demos/local-llm/test/local-llm-browser.mjs:35`).
The round never runs `gpu-render` in Firefox (`round-1117.sh:65`).

## Do

- One launcher of the installed Firefox in `test/browser.mjs`: it points `TMPDIR` at a directory
  under the checkout's `build/` and launches with `channel: "moz-firefox"`. All eleven tests use
  it, and the three `TMPDIR` lines of their own go. `docs/gpu.md:115-116` then says the launcher
  does it.
- The round runs `gpu-explicit` and `gpu-render` in both browsers and fails on either
  (`tasks/20261116-140017-repo-01`).
- The next release's notes drop the "does not start in a systemd unit" limit.

## Done when

`node test/gpu-explicit-browser.mjs firefox` and `node test/gpu-render-browser.mjs firefox` pass in a
round's GPU stage with no `TMPDIR` set by the caller. No round script or release note carries the
systemd explanation.

## Closed (2026-11-17)

Fixed on `ws/release` (`de1d804c3`): `launchInstalledFirefox(preferences)` in `test/browser.mjs`
sets `TMPDIR` to the checkout's `build/firefox-tmp` and launches with `channel: "moz-firefox"`,
headless false, WebGPU on. All eleven tests use it (`test/gpu-explicit-browser.mjs`,
`test/gpu-render-browser.mjs`, the four Godot display tests, both PhotoCraft tests, local-llm,
Mojo and Mojo's target test); the three `TMPDIR` lines of their own are gone, and `docs/gpu.md`
says the launcher does it. The round's GPU stage (`scripts/round.sh gpu`, `tasks/20261116-140017-repo-01`)
runs `test/browser-tests.mjs --display=…`, which runs gpu-render and gpu-explicit once per
browser and fails on any; gpu-render's boot wait is 120 s, as gpu-explicit's, since 30 s ran out
beside a catalog build.

Evidence: that command, the GPU stage's core half, on `:148` under the GPU lock with `TMPDIR`
unset, in a worktree at `b09b1e243` (0.1.7's images) with this branch's test files
(logs in the branch's tree, `build/ws/logs/`): Firefox 159.0.1 started from the snap with its profile
under `build/firefox-tmp` each time; gpu-render passed in Firefox and gpu-explicit in Chrome
(`core-display-v017.log`); gpu-render in Chrome, whose 30 s boot wait ran out at load 37, passed
with 120 s (`gpu-render-chromium-v017.log`, nvidia blackwell); gpu-explicit in Firefox, which ran
out of its 180 s deadline in the page's compile at load 48, passed alone at load 35 in 49 s,
"firefox GPU explicit records PASS" (`gpu-explicit-firefox-2.log`). Before the launcher, the
same Firefox launch timed out (`work/audit-1116-evidence/repo/firefox-launch.log`).

`scripts/round.sh` carries no systemd explanation; 0.1.8's release notes are not written yet, and
the "does not start in a systemd unit" limit is not true of them (the closed tasks that copied it
stay as history).
