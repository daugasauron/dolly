# The same browser tests run again: the npm test four times a release, Xonotic's twice a round

- STATUS: OPEN
- PRIORITY: 170
- TAGS: audit,build,release,npm,0.1.8

From the build-time audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`; logs under its `build/`).

## State (2026-11-17): fixed on `ws/release`; 0.1.8's round and release confirm it

- The round's separate npm stage is gone: `scripts/round.sh suites` runs the browser suite, which
  runs `test/npm-browser.mjs` among the core tests, and no second npm run (`ee2bb0a9a`).
- The checklist's step 3 tests the tarballs it publishes (`DOLLY_NPM_PACKS`), so the release's
  offline run on the published copy (run 4) has nothing left to test (`df6a9389a`,
  `tasks/20261116-140230-repo-05`).
- Xonotic: without a display the test checks the software path alone (the data and fonts, the
  menu drawn by the engine's software rasterizer, "gpu@0 has no device", its sound, the engine's
  screenshot and the loading screen over it), and the GPU stage, which runs it under
  `--display` (`demos/run-browser-tests.mjs`'s `display` map, `withoutDisplayToo`), runs it whole
  (`fe88a4b3a`). Measured on 0.1.7's images: the run without a display passed in 100.8 s, where
  the whole one took 513.7 s in 0.1.7's demos suite.

What only the round and the release confirm: their logs run `npm-browser.mjs` twice in all (the
browser suite's and the checklist's) and Xonotic's whole test once, in the GPU stage.


## Found

`test/npm-browser.mjs` (both browsers unless named, line 56) packs the npm packages from the
checkout and runs itself again offline, in a network namespace of its own (lines 1-9, 60-75). In
0.1.7 it ran four times on the same commit's packages:

| Run | Where | Time |
| --- | --- | --- |
| 1 | `node test/browser-tests.mjs chromium firefox` runs every `test/*-browser.mjs`, this one among them | 236 s + 188 s (`round-1117-evidence/browser.log`) |
| 2 | `work/day-round.sh`'s suites stage, `node test/npm-browser.mjs chromium firefox` again on the same tree | 07:52-08:00 (`round-1117.log`) |
| 3 | `scripts/release-checklist.sh` step 3, after packing the tarballs to publish into `build/npm-v0.1.7` | inside the checklist's 19 min (10:21-10:40) |
| 4 | `work/release-0.1.7.sh`, `DOLLY_NPM_OFFLINE` on run 3's tarballs, in a namespace the script builds the same way as the test does | 307 s + 204 s (`release-0.1.7-evidence/npm-offline.log`) |

Run 2 repeats run 1 exactly: same file, same browsers, same tree. Run 4 repeats run 3 on the
published copy of the tarballs, since run 3 tests a copy it packs itself
(`tasks/20261116-140230-repo-05`, whose Do makes the checklist's run the only one). Runs 2 and 4
are about 16 minutes of the release; 0.1.6's release ran runs 3 and 4 too
(`work/release-0.1.6.sh:52`).

`demos/xonotic/test/xonotic-browser.mjs` runs in the demos suite without a display (513.7 s,
"the client drew in software, gpu@0 having no device") and again in the GPU stage on `:148`
(573.5 s, `gpu-xonotic.log`). The GPU run does all the headless run does (serverbench, gmqcc, the
match, sound, the menu screenshot, SIGKILL) and adds the GPU's draws; what only the headless run
covers is the software path. It is the demos suite's longest test, and the suite runs it alone.
(godot-projects and godot-x11, run in both and failing without a display, are
`tasks/20261115-115901-godot-display`.)

What it costs: about 16 minutes of each release and 8.6 minutes of each round, of a release that
took 13 h 31 min (`20261116-140603-buildtime-00`).

## Smallest fix

- The round's separate npm stage goes: the browser suite already ran the file. The round is
  `work/day-round.sh` today; `tasks/20261116-140017-repo-01` moves it into `scripts/`, which is
  where this line is dropped.
- Runs 3 and 4 become one: `tasks/20261116-140230-repo-05`.
- Xonotic's headless run checks the software frame alone (skip the parts the GPU stage repeats
  when `gpu` is false, `xonotic-browser.mjs:19`), or the demos suite names it in `needs` with the
  GPU stage as the place it runs whole.

## Done when

A round and a release, from their logs, run `npm-browser.mjs` twice in all (the browser suite, the
checklist on the published tarballs) and Xonotic's full test once, the software path still checked.
