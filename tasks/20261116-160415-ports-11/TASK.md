# 29 demo tests run in Chromium only; in Firefox the rust demo fails (rustc refused: the program's module was not provided)

- STATUS: CLOSED
- PRIORITY: 180
- TAGS: audit,ports,firefox,rust,wine,tests,0.1.8

## State (2026-11-17)

The rust failure is fixed on branch `fix/module-wait` (commits `6148eb92d` and `f7c035612`,
page JavaScript only), merged into `integrate/0.1.8` (`affb461e2`); checked against
`work/round1113`'s dist by per-file links. Evidence and drivers: `work/audit-1116-evidence/ports/fix-module-wait/`
(`INDEX.txt`). Two causes, both measured in Firefox 155 with the supervisor and process Worker
traced:

- The module was lost, not late. The supervisor hands a held module (16 MiB or more) to the
  process Worker on a MessageChannel whose ports it transfers to the holder and the Worker and then
  drops. Firefox files what the holder posts under its port's identity, which the transferred
  port's original in the supervisor keeps, and forgets it when that original is collected
  (`MessagePort::CloseInternal` calls `ForgetPort` in any state). A collection in the runtime
  Worker between the post and the Worker's read left the Worker a `messageerror` nobody heard
  (traced: 0.3 ms after it started its port), and the 10 s timeout refused it. The 10 s never
  covered a compile: the holder has compiled before the launch (rustc 1.0 s at load 9, 2.4 s median
  and 3.7 s at most at load 20 to 33), and the Worker has the module 0.3 to 0.5 ms (median) after
  starting its port, 0.6 s at most; it is compiled once and shared, each Worker instantiating it
  in 0.25 s to 1.2 s. A page of its own (`handover/`) lost 5 of 24 hand-overs while the
  supervisor collected garbage, none of 24 when it kept either port, none of 24 in Chromium. Fix:
  the thread keeps the channel until its Worker goes; a `messageerror` refuses at once.
- Behind it, the Tokio build failed in Firefox with "out of memory": the 256 MiB cache cannot hold
  rustc (254.5 MiB) and its linker (91.6 MiB) together, so each rustc `cargo rustc -j 4` started
  while another ran compiled a copy of its own; with three copies held, the next compile failed
  (Firefox's Workers share one budget of code memory; seven copies of a 156 MiB rustc fit, the
  eighth failed). Fix: a launch takes the module a running process holds, back into the cache.

Run on the commits' tree at load 13 to 37 (`rust-summary.txt`, `others-summary.txt`): the rust
demo test passed in Firefox three times in a row (303, 310, 281 s) and in Chromium (138 s); the
amy test's `amy cargo alone` and `test/process-browser.mjs` passed in both browsers; `npm run
test:source` passed.

The rest is done on `ws/ports` (`ead02d08c`). `demos/browsers.mjs` gives a demo test the
browser `DOLLY_BROWSER` names; imported without it, it runs the test again in each browser, a
process for each, so that module state of one run (a fixture's request log, as Pi's frontend
test keeps) cannot reach the other: a test run alone, or by the demos suite, runs in both. Every
demo test whose browser was Chromium by default or by an argument takes its browsers from it
(45 files: the eleven, the parts of four, `x11` and `ghostty-gtk`, whose default was Chromium, and
the tests that took an argument), as do 0 A.D.'s tests that need no GPU (OpenAL, SpiderMonkey,
ENet, the engine, multiplayer without a window). Where Firefox cannot run a part, the test says so
on its Firefox line: `pi-phone` (Playwright emulates no phone in Firefox), ClassiCube (its
fixtures drive Chrome's DevTools input), 0 A.D.'s shader check (Chrome's SwiftShader adapter),
its visual multiplayer modes (Chrome's GPU window), Mojo without a display (Firefox has WebGPU in
a window only). `sdl2-browser.mjs` drives Firefox through Playwright's keyboard (a repeated
down is a repeat) and the page's key events for text off its layout, where Chrome takes
DevTools key events; its probe prints what it was typed. Wine's `site` session waits until
NetSurf's title names the licences page before it presses Back, and the home page again after
it, instead of 2.5 and 2 s. The page's dark pixels do not tell the two pages apart, and the
address does not tell a loaded page: NetSurf shows the licences address while it still fetches
the page, its Back button disabled, and a Back pressed then leaves the licences page (measured,
`ff-3`: the address's right end stayed at x 154 against the home page's 73).

Runs on `ws/ports` (logs in `work/audit-1116-evidence/ports/fix-ports/`, `both-*`, `ff-*`,
`cc-*`), each test once per browser by `demos/browsers.mjs`, at a load of 35 to 42 on 16 cores
(round 1117 ran the same tests 3 to 6 times faster): in Chromium and Firefox, `sdl2`,
`janis-install`, Pi's ask-user, frontend, `pi` and session tests, the studio, `imgui`,
`sdl2 audio`, `ocaml` and its fixpoint, `emacs` and its package, `pi-local`'s start screen,
`javascript`, `vendor-crates`, `rts` and its layout and input; ClassiCube in Chromium, its
Firefox line saying why it is skipped; `xonotic` in Chromium (its Firefox run was refused when
`rust-sdk`'s pin changed under it, `tasks/20261116-140352-ports-02`). On round 1113's images
(the release's recipes, catalog and snapshots in place, `released-mode.sh`), in Firefox:
`cmake`, `codex`, `neovim`, `tmux` (its three parts), `python-data` with `openblas` and `numpy`,
`ghostty-gtk`, 0 A.D.'s OpenAL, SpiderMonkey, ENet, engine and headless multiplayer checks, the
speech packages (with `pi-phone`'s line saying why it skips), ClassiCube's skip line (`rel-ff`,
`rel-ff2`, `rel-ff3`), and `wine` (`rel-ff3`; on this branch's `wine` in Chromium, `both-17`).
Its GIMP session, which no Firefox run had reached, compares the stroke drawn with the stroke
saved within a pixel: in Firefox the stroke as drawn keeps one pixel of the tool's mark (4002
against 4001, measured, `rel-ff2`).

The round confirms the rest: the demos suite (`npm run test:demos`) on its images, every test
with a Firefox line or the need that keeps it out; among them `xonotic` in Firefox and
`pi-phone` in Chromium, which this tree could not run on its own builds. Images the change
rebuilds: none (tests).

## Closed (2026-11-19)

Round 018k (`integrate/0.1.8` `8d666a4e4`, `work/integrate-018/build/round/`): its demos suite
(`suites.log`) has a Firefox line for every one of its 73 test names with a Chromium line, but
`amy tools` (below); the 29 of this task all have one: each passed in both browsers, `xonotic`
(73.7 s, 81.4 s) and `rust` (101.7 s, 113.3 s) among them, but `classicube` and `pi-phone`,
whose Firefox lines name the need (Chrome's DevTools input; no phone emulation in Firefox), and
`wine`, which passed in Firefox (the `site` session included) and failed in Chromium at GIMP's
save dialog (`wine-browser.mjs:351`, not a Firefox matter). `pi-local start screen` passed in
both in the gpu stage (`gpu.log`). The rust demo passed in Firefox three times in a row again on
`fix/rc-ports`'s threaded rustc (81.0, 80.7, 85.6 s). `amy tools` (a demo test added since,
Blender's libraries) passed in Chromium and exceeded its 900 s in Firefox; run apart on the
round's images it passed in Firefox in 108 s and 172 s, and a third run stopped when one of the
first four sessions took over the 30 s `openImage` allows to boot; four boots at once took
0.9 to 10.6 s in five rounds (`work/evidence-2026-11-19/rc-ports/firefox/`). That intermittent
stall is not of this task.

## What

`docs/deployment.md:143-144` asks for "browser suites in both browsers, demos" before a release.
The demos suite runs each test in the browser the test picks, Chromium by default. In 0.1.7's
round (`work/round1113/build/round-1117-evidence/demos.log`) 29 test names passed in Chromium and
never ran in Firefox: classicube, closed-source-agent, cmake, codex, emacs package, ghostty-x11,
janis-install, javascript, neovim, numpy, pi, pi ask-user, pi frontend, pi session, pi-local start
screen, pi-phone, python, rts, rts layout and input, rust, sdl2, speech (and its packages and
refused), studio, tmux package, wine, x11, xonotic. Eleven of them run in Chromium whatever is
asked, passing no `browser` to `demoTest`, whose default is Chromium (`demos/browser.mjs:209`):
`classicube-browser.mjs` and `rts-browser.mjs` (their `DOLLY_BROWSER_PORT` picks a port, not a
browser), `cmake-browser.mjs`, `codex-browser.mjs`, `sdl2-browser.mjs`, `studio-browser.mjs`,
`pi-local start screen` (`local-llm-browser.mjs:18`), and the `python`, `numpy`, `emacs
package` and `tmux package` parts of tests whose other parts loop over both browsers
(`python-browser.mjs:63`, `python-data-browser.mjs:107`, `emacs-browser.mjs:54`,
`tmux-browser.mjs:199`); `pi-phone` runs only when the speech test's browser is Chromium
(`speech-browser.mjs:67`). The rest take `DOLLY_BROWSER` or an argument.
How each demo test file picks its browser: `test-browsers.sh`, `test-browsers.tsv`.

Run in Firefox (Playwright's `firefox-1543`, headless, one at a time; the machine at load average
22 to 28 from other work), logs in `work/audit-1116-evidence/ports/firefox/` (`summary.txt`):

| Test | Result |
| --- | --- |
| x11, neovim, javascript, pi, closed-source-agent, janis-install, xonotic, pi frontend | pass |
| speech | failed once ("0.1 s of sound were lost: the model fell behind"), passed the second time |
| rust | failed three times out of three, at different steps (below) |
| wine | failed twice at the same step (below) |

**rust.** All three runs end with `dolly: process N was refused: the program's module was not
provided` for `rustc`. The first at the session's first `rustc` (`rust.log`: "preparing 254.5 MiB
WebAssembly executable", "executable ready in 3.4s", then the refusal), so with no other large
module compiled before it; the second after four `rustc` runs had worked, when `cargo` started
one (`rust-2.log`); the third, at load average 19.7, past the proc-macro steps, when `cargo
rustc -j 4` built the tokio fixture and two of its `rustc` processes (`quote`'s build script,
`libc`) were refused (`rust-3.log`). The message is `page/process-worker.mjs:144`: a process Worker waits 10 s for
its compiled module from the Worker that holds it, which the supervisor uses for every executable
of 16 MiB or more since `d130c6c45` (2026-11-04; `page/process-supervisor.mjs:48-66`, `653-661`).
In a `rust-tools` session, `rustc --version` and `cargo --version` launched 22 times in Firefox:
one refusal (`rustc-firefox.json`, `rustc-firefox.log`); 60 more launches in Firefox: none
(`rustc-firefox-2.log`); the same 22 in Chromium: none (`rustc-chromium.log`). The rust demo last
passed in Firefox on 2026-10-14 (`work/evidence-2026-10-14/demos-firefox.log`), before that
change; no later run of it in Firefox is recorded under `work/`.

**wine.** Both runs time out at "the page the redirect leads to" (`wine-browser.mjs:521`, the
`site` session). The screenshots (`wine-evidence/failure-site-2.png`; the first run's was
overwritten by the second in `work/round1113/build/wine-evidence/`, where the test writes) show
NetSurf's address field holding the end of the typed address followed by `site:///`
(`…309/fixture/netsurf/moved/page.htmlsite:///`, then `http://oved/page.htmlsite:///`). The test
clicks Back, waits a fixed 2 s (`:512-513`), selects the field with Home and Shift+End and types
the address; the screenshots fit NetSurf setting the field to the home address while it is being
typed. In Chromium afterwards the whole test passed, that session included ("a redirect is
followed to its last address, Home returns"; `wine-chromium.log`, 134 s), but at load average
12.4 against 23 to 24 for the Firefox runs, so it does not separate the browser from the load.
Not run in Firefox on an idle machine.

AGENTS.md: "Verify changes in a real browser."

## Smallest fix

- Find why the module does not reach the process in Firefox: listen for `messageerror` on the
  channel in `programModule` and log when the supervisor ends a holder (`#release`), then rerun
  `rustc-firefox.json` until it fails.
- Give the eleven a `browser` from `DOLLY_BROWSER` or their loop, as the others have, and make
  the demos suite run every test in both browsers, as `docs/deployment.md` asks.
- In `wine-browser.mjs`'s `site` session, wait for the home page after Back instead of 2 s.

## Done when

The rust demo passes in Firefox three times in a row (it failed three of three tonight); the
demos suite's log has a Firefox line for every test that has a Chromium one, or names the need
that keeps it out.
