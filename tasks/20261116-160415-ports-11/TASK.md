# 29 demo tests run in Chromium only; in Firefox the rust demo fails (rustc refused: the program's module was not provided)

- STATUS: OPEN
- PRIORITY: 180
- TAGS: audit,ports,firefox,rust,wine,tests,0.1.8

## State (2026-11-17, `fix/module-wait`)

The rust failure is fixed on branch `fix/module-wait` (`work/fix-module-wait`, commits
`6148eb92d` and `f7c035612`, page JavaScript only), to merge; checked against `work/round1113`'s
dist by per-file links. Evidence and drivers: `work/audit-1116-evidence/ports/fix-module-wait/`
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

Left (this task, not touched): the eleven tests that run in Chromium whatever is asked and the
demos suite in both browsers, and wine's `site` session in Firefox (both in Smallest fix).

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
