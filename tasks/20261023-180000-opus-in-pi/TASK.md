# Opus 5.5 in Pi inside Dolly: an audit of the environment, a small game, and guidance that does not confuse models

- STATUS: OPEN
- PRIORITY: 300
- TAGS: pi,agent,agent-experience,0.1.4

Owner (2026-10-23): "Make it a high priority task to run opus5.5 inside PI using this key,
make it write an audit of the environemnt from inside dolly and download it. I want the dolly
ewxtension/system prompt about dolly etc to be nice so the models doesn't get confused, it
should also know what tools are available (amy, nena etc). Make it write some cool game
(small though) dont use more than $20 for this task."

The key: the owner's API key in `~/.claude-api` (organization "Oskar's Individual Org", $200 of
API credits for the Claude API, not for Claude Code; expire 2026-11-02). Read at run time,
typed at a hidden prompt (`secretenv`, or Pi's `/login` API-key option, which Dolly's Pi
masks), never in a file, log, screenshot or commit, sent only to api.anthropic.com. Pi on
Claude through this key works in Dolly (one `pi --provider anthropic` turn answered,
`tasks/20261023-132500-claude-subscription`). Model: `claude-opus-5-5`.

Budget: at most $20 for the whole task, read from Pi's running cost and written here after
each session.

Done when:
1. The Dolly guidance Pi reads (`demos/pi/SYSTEM.md`, the `dolly` skill, `dolly-tools.js`)
   tells a model plainly what Dolly is and is not, what tools exist and how to get more
   (`amy`, `nena`, `download`, `upload`, `cc`, `janis`, `ps`, `man`, `help`), and what fails
   and why; checked by sessions with Opus 5.5 before and after, transcripts kept.
2. Opus 5.5 in Pi in Dolly writes an audit of the environment from inside it and saves it with
   `download`; the file is in the task directory.
3. Opus 5.5 in Pi in Dolly writes a small game that runs in Dolly; its source and a screenshot
   are in the task directory.
4. The spend is recorded and under $20.
5. Owner (2026-10-23): "After the audit is complete, the issues should be fixed." Every
   finding of the audit is fixed and verified, each with a reproduction first: those in Pi's
   guidance, tools and extension by the agent of this task, the rest (shell, commands, kernel,
   page) listed here with their reproduction and fixed by the integrator or another agent before
   the 0.1.4 round; one that needs a design decision goes to the owner as one line.

## State (2026-10-23 16:35 JST, branch `demo/opus-in-pi`)

Done-when 1 to 4 are met; 5 is met for Pi (fixed here) and open for the five findings under
"Findings to fix outside Pi" and the three lines "For the owner". Five sessions of Opus 5.5
in Pi in pi-agent cost $0.762 of the $20 (Pi's footer and the session files agree). The
images rebuilt here are `pi`, `pi-runtime` and `pi-agent`; `bhop`, `classicube`,
`dollyfile-studio`, `pi-local`, `pi-phone`, `rts-arena` and `slopyard` install `pi` and are
stale until the integrator's rebuild. `demos/pi/test/pi-browser.mjs` passes on the final
image in Chromium (49 s) and Firefox (53 s).

Branch `core/audit-fixes` (2026-10-23 18:05): the five findings under "Findings to fix outside
Pi" and the integrator's `/proc` decision are fixed and measured in Chromium and Firefox, each
under its entry (`which` through the guidance); the seed changed, so every image is stale until
the catalog round. Left, one line each:
- pi-agent's `REQUIRES HOST nena@0` (the integrator's, at the merge); the `exec` line is the owner's.
- pi-agent was not rebuilt here (`rust-build` is a hugebuild): amy's record there is checked by
  the catalog test and on `system`, not on pi-agent itself.
- `custom-session-browser.mjs` fails in Chromium on Chrome 156's 127 MiB IndexedDB value limit
  (its legacy-store step puts the 151 MB image as one ArrayBuffer); not caused here, not fixed.
- `amy-browser.mjs` (tar `-j`/`-z` cases added) runs only after the catalog round builds every package.

## State (2026-10-23 21:15 JST, branch `demo/opus-audit-2`): round 2 done

Ten more sessions ("Round 2", at the end), $3.786; with round 1, **$4.548 of the $20**
(Pi's footer and the session files agree). Before the guidance change Opus wrote every game
from scratch on the raw display and never looked at `amy`; after it, every session installed
and reused a library (raylib, SDL2, FreeType, libpng, SQLite) in its first commands, with
fewer failed calls and a third less time and money for the same prompt. Fixed here, each with
a test that failed before: SDL2's accelerated renderer in the session that installed it, and
Pi running a response's shell command and edit at once. Lines for the packages workstream and
the owner are in round 2. Rebuilt in this tree: `sdl2`, `quickjs`, `janis`, `typescript`,
`pi-build`, `pi`, `pi-dolly`, `pi-runtime`, `pi-agent`, `closed-source-agent`; stale until the
round: `imgui`, `imgui-x11`, the SDL2 games, and the images on Pi and Janis.

For the owner, one line each:
- A display program started from Pi's `bash` tool takes the canvas over Pi until it exits
  (one session lost 180 s so); should the display lease go only to the terminal's foreground
  process, so that it fails at once instead?

## Method

`build/opus-evidence/drive.mjs` (not committed): `pi-agent` of this branch's `dist/` served by
the checkout server, headless Chrome 151 (`--no-sandbox`) under `slot.sh browser`, with a
hardened HTTP policy: `x-api-key` may leave only for `https://api.anthropic.com/v1/`, GET
for the page's origin and a dozen public hosts (raw.githubusercontent.com, api.github.com,
the jsdelivr CDNs, registry.npmjs.org, pypi.org, github.com, example.com...), nothing else.
The script leaves the entry's Pi, starts `pi` from Slop in `/workspace`, `/login anthropic`
→ "Sign in with an API key", types the key read from `~/.claude-api` at run time (the prompt
shows `*`), `/model anthropic/claude-opus-5-5` (in Pi 1.0.3's catalog: $4/$20 per million,
cache read $0.20; thinking level as Pi defaults), pastes each prompt, waits for the turn,
reads Pi's footer cost, and stops before a budget. Every text it keeps is redacted against
the key and each 6-character run of it, and `check.mjs` counts both in every kept file.
The session file is fetched with `download` and turned into `transcript.md`.
`probe.mjs` runs shell commands in an image without a model, to check claims.

## Session 1, before (2026-10-23 15:37, `build/opus-evidence/before/`, $0.093)

Three prompts in one session: what is this environment; a Python one-liner and the running
processes; what would you write a game in, how to run it, how to get its source out.

Right: Dolly, a Unix-like system in a browser tab as wasm64, in-memory files, Slop not Bash,
cc/make, janis/qjs, amy, upload/download, no host escape, no npm; `amy install ps` then `ps`;
the game in C with `display.h`/`input.h`, `download` for the source. It did not read the
`dolly` skill until the third prompt.

Confused:
- Python: `amy install python` printed "needs dso@0: add REQUIRES HOST dso@0"; the model
  concluded "this browser host doesn't support loading shared libraries, so CPython can't be
  installed in this session". It is this image's module list (pi-agent declares neither
  `dso@0` nor `sockets@0` and has no `nena@0`), not the browser.
- Bundling the game's files: "`tar czf game.tar.gz ...` and download that one file". This
  image's `tar` only extracts and `gzip` only decompresses (the skill says so; it was not read).
- Processes: `ls /proc` says "No such file or directory" and then `ps` reads `/proc/processes`
  (documented: there is no general `/proc`); it tried `amy search` (no such subcommand) and
  `which python3` ("not an external command").
- Persistence: "work can disappear when the tab closes unless you download it or push it
  somewhere"; saving the session (Ctrl+Shift+S) was not mentioned, and pushing needs a relay.
- Nothing about `nena`, `man`, `help` or `amy list` came up before it hit a wall.

## The guidance change (`6f480f9a`, then the grep line)

Checked first without a model (`probe.mjs` in `pi-agent` and `default`): `amy install
python` in pi-agent "needs dso@0: add REQUIRES HOST dso@0" (python needs `dso@0` and
`sockets@0`; `default` declares both and installs it); `nena` is not in pi-agent and `amy
install nena` "needs nena@0"; `ps` is the `ps` package, `/proc/processes` is there, `ls
/proc` finds nothing; `tar` only extracts and `gzip` only decompresses, `amy install tar`
writes `.tar` but `tar -czf` fails with "tar: fork: Function not implemented", `git archive
-o out.tar.gz` works; `grep -r`, `grep -A` and `sed -i` print usage, `rg -A1` works and
`amy install toybox` brings a grep and sed with them; curl to github.com is status 7, to
raw.githubusercontent.com 200; no `bash`, `node`, `npm`, `pip`, `sudo`, `/etc/os-release`.

- `SYSTEM.md` (always in the prompt; the skill is read late or not at all) now says what Dolly
  is and is not (not Linux, no native binaries, no fork/exec, HTTP only, no terminal for the
  bash tool, and how the user runs a game: Ctrl+D, Slop, `pi -c`), the tools and how to get
  more (`amy list`/`install`, host modules in `/etc/dolly/Dollyfile`, `nena` where the image
  declares `nena@0`, POSIX grep and sed, cc, janis, git, download/upload, Ctrl+Shift+S).
- The skill: python's two modules and `nena enable`, processes, files in and out (git archive,
  what tar and gzip do), and "When a command fails" (127, 126, ENOSYS, hidden stderr).
- `dolly-tools.js`: the bash tool's description says Slop without a terminal, not "Execute a
  bash command" (the pi-local proposal); the download tool says the user clicks Save.

## Session 2, after (2026-10-23 16:02, `build/opus-evidence/after/`, $0.079)

The same three prompts on the rebuilt pi-agent. Read the module list itself, answered python
right ("needs the dso@0 host module... `nena` isn't available here, I can't turn that module
on"; offered `janis -e`), used `/proc/processes`, knew that a game is played in Slop after
Ctrl+D and `pi -c`, `git archive` for the source and Ctrl+Shift+S. One new stumble:
`grep -A3` (POSIX grep has no `-A`), so the prompt now names POSIX grep and sed, `rg` and
`toybox` (pi-agent rebuilt again).

Spend so far: $0.172.

## Session 3, the audit and a first game (2026-10-23 16:05, `build/opus-evidence/audit/`, $0.212)

The guidance of `425f0400`. Opus read the `dolly` skill first, ran 15 tool calls and wrote
[`audit.md`](audit.md) (116 lines), saved through its `download` tool: the browser
download Playwright captured, committed unchanged (no key material, `check.mjs`). Then it
wrote a number-guessing game in C (`game/guess.c`), built it, tested it with piped input and
a fixed seed, wrote `/workspace/play` and downloaded the source. It works, but it is not the
"cool game" the owner asked for: a second session asks for a real-time one.

## The audit's findings, reproduced (`probe.mjs` in pi-agent, no model)

Fixed in Pi's guidance and tools (this branch):
- **The audit's first download failed**: "download failed: No such file or directory". Opus
  sent `write` and `download` in one response and Pi runs a response's tool calls at once.
  Reproduced in `demos/pi/test/pi-browser.mjs`, whose scripted model now writes a file and
  downloads it in one response: no download was offered (Chromium, the tool result was that
  error). The download tool is now `executionMode: "sequential"`, so the batch runs in
  order; the test passes in Chromium (55 s) and Firefox (62 s).
- `chmod +x play` ("command not found"): `SYSTEM.md` says there are no permission bits and a
  `#!` script runs without one (measured: `/tmp/s2` with `#!/bin/slop` runs).
- `amy install python 2>&1 | tail -3; echo $?` printed 0 when amy failed (amy's own status
  is 1, `set -o pipefail` gives 1): the skill says so.
- Session 2's `grep -A3` (POSIX grep): `SYSTEM.md` names `rg` and `toybox`.

## Findings to fix outside Pi

Each reproduced in pi-agent (`build/opus-evidence/probe5.out`, `probe6.out`):
- **`kill %1`**: `sleep 30 & kill %1` prints "kill: strtonum %1: invalid", status 1. Slop
  refuses `jobs`, `fg` and `bg` by name; a job spec to `kill` gets sbase's parse error. A
  refusal that says there is no job control and names `$!` would match the others.
  Fixed (`core/audit-fixes`): Slop refuses `kill` with an operand that starts with `%`
  before it starts sbase's kill: "slop: kill: %1: there is no job control; kill $! or a PID",
  status 2, as for `jobs`; `help` and `docs/slop.md` list it. A case of
  `test/fixtures/slop-cases.mjs` (`jobs; fg; bg; kill -TERM %1`: 8 here, 3 in Bash) fails
  on the old shell (7: sbase's kill ends with 1). Measured in `build/auditfix-evidence/core.out.*` (probe.mjs in the rebuilt `system`; `default.out.*` in `default`), Chromium and Firefox: `sleep 30 & kill %1` prints that line, status 2, and `kill $!` ends the sleep; `help` lists `kill %N`.
- **amy says the compiler is not installed**: in pi-agent `amy list` shows `cc` and `make`
  as `-` and `amy info cc` says "not installed", while `command -v cc make` finds `/bin/cc`
  and `/usr/bin/make` and `cc --version` works. Opus noted it; a model may reinstall 125 MB.
  Why: amy reads `/etc/dolly/installed`, which only `INSTALL` writes. `cc`, `make` and `core`
  are packages that keep files of `system-build`, `posix` and `ninja` of `system-tools`, and
  `session-recover` of `system`; every image built `FROM` those holds their files without a
  row (pi-agent's record had 13 rows, none of them). Fixed (`core/audit-fixes`): `system`, the
  base of every image with amy but `default`, installs the six, so its record names what it
  holds; `session-recover` is now built in its own recipe (`FROM system-tools`) instead of
  in `system`, which only installs it. `test/dollyfile-catalog.test.mjs` checks that an image
  with amy installs every package its bases hold (it fails on the old `system`: "closed-source-agent
  holds cc but does not install it"). Measured on the rebuilt `system` with amy (probe.mjs
  `system+amy`, `build/auditfix-evidence/amy.out.*`), Chromium and Firefox: `amy list` shows
  cc, core, make, ninja, posix and session-recover installed, `amy info cc` says installed,
  `amy install cc make` says each is already installed. pi-agent inherits the record from
  `system`; it was not rebuilt here (its closure rebuilds rust-llvm and rust-build).
- **`test -nt`, `-ot`, `-ef`**: `touch a; sleep 1; touch b; [ b -nt a ]` prints
  "[: unsupported expression", status 2 (all three are POSIX.1-2024). Opus's play script used
  `[ guess.c -nt guess ]`.
  Fixed (`core/audit-fixes`): Dolly's `test` (`src/commands/test.c`, also `[`) compares two
  paths as POSIX.1-2024 says: `-nt` and `-ot` by modification time, a path that resolves to
  no file being older, `-ef` by device and inode; its manual page and `docs/slop.md` list
  them. A Slop command case checks them against Bash. Measured in `build/auditfix-evidence/core.out.*` (probe.mjs in the rebuilt `system`; `default.out.*` in `default`), Chromium and Firefox: `[ b -nt a ]` 0, `[ a -nt b ]` 1, `[ a -ot b ]` 0, `[ a -ef a ]` and a link `[ l -ef a ]` 0, `[ a -ef b ]` 1, `a -nt missing` and `missing -ot a` 0, `missing -nt a` 1; `man test` lists them.
- **`which NAME` for a missing command**: `which python3` prints "which: python3: not an
  external command", status 2 (sbase's wording), which reads as if it were a builtin.
  Fixed in the guidance instead (`core/audit-fixes`): a Dolly `which` (`13afd506`, measured
  in both browsers: nothing and status 1 for `which python3`) was reverted (`950e7ef1`) on the
  integrator's word: the core audit (`tasks/20261023-200000-core-audit`, finding 2) decided
  against a second command for a message. sbase's `which` stays; `docs/slop.md`, Pi's
  `SYSTEM.md` and the `dolly` skill say that `command -v NAME` ends with 1 for a missing
  command (measured with the native Slop, whose `command` the browser's Slop cases also run)
  and that `which` ends with 2 and "not an external command". Not rebuilt after the revert.
- **`tar -czf`** (the `tar` package): `tar -czf x.tgz d` prints "tar: fork: Function not
  implemented", status 1. Explicit, but it could say that `-z` is unsupported here.
  Fixed (`core/audit-fixes`): decided to port rather than refuse, since the change is small and
  portable POSIX (`demos/tools/sbase-tar-spawn.patch`, 40 lines, zsh's precedent): sbase's
  `comp`/`decomp` start the filter with `posix_spawnp` (dup2 actions, the kept pipe end
  `FD_CLOEXEC`) instead of fork and exec, and tar waits for it before it exits, so the archive is
  whole when the shell goes on (upstream does not wait: a race on any system, wide here, where a
  process starts in tens of milliseconds). `-j` and `-J` now work both ways with the bzip2 and xz
  packages; `-z` runs `gzip` from PATH: none in `default` ("tar: posix_spawnp gzip: No such
  file or directory", status 1), and the core's gzip only decompresses and took only `-dc`:
  it now also takes the `-cdf` that `tar -xzf` passes, and its refusal to compress names
  pigz ("this gzip only decompresses to stdout; pigz compresses (amy install pigz)"), so
  `tar -xzf` works wherever the gzip package is and `tar -czf` fails with that line;
  `tar -cf - DIR | pigz > OUT.tgz` writes one. Measured in `build/auditfix-evidence/core.out.*` (probe.mjs in the rebuilt `system`; `default.out.*` in `default`), Chromium and Firefox: `gzip -cdf a.tar.gz` gives the same 10240 bytes as `gzip -dc`, `gzip -cf` prints that line, status 2. In `default` with tar, gzip, pigz and bzip2 installed (`tarz.out.*`, both browsers): `tar -czf x.tgz d` prints gzip's line, status 1; `tar -cf - d | pigz > y.tgz`, then `tar -xzf y.tgz` and `tar -tzf y.tgz` unpack and list the tree; `tar -cjf`/`-tjf` round trip.
  Measured in `default` with tar, bzip2, xz and pigz installed by amy (`build/auditfix-evidence/tar.out.*`,
  probe.mjs), Chromium and Firefox: `tar -cjf x.tbz d` 183 bytes at once, `-xjf`, `-cJf`/`-xJf`
  round trips, `tar -cjf - d | bzip2 -dc | tar -tf -` lists the tree. `test/amy-browser.mjs`'s
  tar case adds the `-j` round trip (not run whole here: it installs every package).

Verification on `core/audit-fixes` (2026-10-23 18:00, the seed changed: rebuilt `system-build`
to `system` and `default` with their packages and `dolly-docs`, last with `help.c`'s
corrections (`0bcbd132`: `$'...'` is supported, 1024 descriptors, `ps` and
`/proc/processes`); `cmake-build` to `tar`, `pigz`, `gzip`, `bzip2` on the seed before that;
not rebuilt: everything else, pi-agent among them, and nothing after the `which` revert, for
the integrator's catalog round): `node --test 'test/*.test.mjs'` passes (356); in Chromium and
Firefox `core`, `slop`, `shell`, `process`, `session-offline` and `man` browser tests pass on
the final images (`build/auditfix-evidence/tests-final.log`).
`default-browser.mjs` stops at its first check because a narrowed build's `amy-index.txt`
lists no python (it passes with the full index, below); `custom-session-browser.mjs` passes in
Firefox (82 s: sessions saved and loaded, `/proc` not among their files) and fails in Chromium where it stores the 151 MB custom image as one ArrayBuffer: Chrome 156 refuses any
IndexedDB value over 127 MiB, measured alone (`build/auditfix-evidence/idb-limit.mjs`: 130 MB
stored, 140 MB "The serialized keys and/or value are too large"), and `system` was 151.2 MB
before these changes too.
With a python row added to the generated `amy-index.txt` for the run, `default` and
`composed toolchain` pass in both browsers; `composed dependency` needs the `zig` package,
not built here.

## Next audits (owner, 2026-10-23, 19:00)

"I want to keep that one going - run more audits using API key from inside the environment to
improve the user experience. Make it build some more complicated game and investigate the
traces (it should realize what prebuilt packages are available, raylib sdl etc) and be able
to reuse them." Budget as before: at most $20 for the task.

## For the owner

- pi-agent and pi-local declare neither `dso@0` and `sockets@0` nor `nena@0`, so
  `amy install python` cannot work there (Opus now says so); add `nena@0` as `default` has?
- `exec PROGRAM` at the end of a wrapper script fails ("replacing the shell with a command is
  unsupported"); Opus's first `play` used it. Run it as a child and exit with its status?
- `ls /proc` finds nothing while `cat /proc/processes` works (documented); models read the
  first as "no process list". Should `/proc` list `processes`?
  Decided by the integrator (2026-10-23): yes. Fixed (`core/audit-fixes`): the kernel makes
  `/proc` at boot with `processes` in it, an empty file, as Linux's are, so `ls /proc` lists
  it and `stat` finds it; an open of that file by any path (`cd /proc && cat processes`)
  gets the list, found by its device and inode instead of the literal path, and a write to
  it is still refused. Boot's pruning keeps `/proc` as it keeps `/dev`, and sessions do not
  save it. `test/process-browser.mjs` checks `ls /proc`, the empty file and relative
  paths (it asserted `! test -e /proc` before). Measured in `build/auditfix-evidence/core.out.*` (probe.mjs in the rebuilt `system`; `default.out.*` in `default`), Chromium and Firefox: `ls /proc` prints `processes`, `ls -l /proc` an empty file, `ls /` lists `proc`, `head -2 /proc/processes` and `cd /proc && head -1 processes` print the list, `echo x > /proc/processes` is refused ("Permission denied", status 1).

Not defects (by design or the network): no `df`; each `cc` shows as two processes (the
compiler is a private process behind it); github.com and example.com send no CORS headers.

Spend so far: $0.384.

## Session 4, the game (2026-10-23 16:18, `build/opus-evidence/game/`, $0.254)

Asked for "a small game that is fun to play here... real-time, with graphics on Dolly's
display or a lively terminal screen". Opus read the skill, `display.h` and `input.h`, and
wrote [`game/rocks.c`](game/rocks.c), an Asteroids in 233 lines of C on Dolly's display
(vector rocks that split, bullets, lives, waves, score; arrows or WASD, Space, R, Q/Esc).
It built it without warnings, checked it with a headless `--test` mode (two minutes of
simulated play), wrote `/workspace/play` and downloaded the source in the same response
as a `bash` call (the sequential download, working). Its first `play` used `exec`, which
Slop refuses; it rewrote it. `SYSTEM.md` now says a script's `exec PROGRAM` fails (both
sessions 3 and 4 tried it). [`game/rocks.png`](game/rocks.png): the game built in a fresh
pi-agent from the downloaded source and played with held keys (`play-game.mjs`; score 30, a
rock split); the session's own run of `/workspace/play` drew the same field.

Spend so far: $0.638.

## Session 5, the final guidance (2026-10-23 16:23 and 16:26, `build/opus-evidence/final/`, `final2/`, $0.124)

The three prompts of sessions 1 and 2, the third replaced by "Make /workspace/hello: a C
hello-world program and a script `run` that builds and starts it. Then save both to my
computer as one archive." Python: "needs dso@0... no way to turn it on from inside... a
different Dolly image", with `janis -e` instead; processes from `/proc/processes`; no
`chmod`, no `exec`. For the archive it tried `tar -czf` first and used `git archive` after
tar's own message, so the download line of `SYSTEM.md` now names `git archive`; on that
image (`final2`) it went to `git archive` at once and downloaded `hello.tar.gz` (Playwright
saved it; it lists `hello/hello.c` and `hello/run`). After Ctrl+D, `pi -c` showed that
conversation again with its footer, as the guidance tells the user.

Spend, all sessions: $0.093 + $0.079 + $0.212 + $0.254 + $0.086 + $0.038 = $0.762.

## Round 2: a bigger game, and the packages it should reuse (branch `demo/opus-audit-2`)

Kept here: the platformer's source as Opus downloaded it with a screenshot
([`platformer/`](platformer/)), and pictures of four other results ([`round2/`](round2/):
the raylib Galaga after the guidance change, the raylib 3D corridor, SDL2 with FreeType,
the chart from SQLite through FreeType and libpng). Checked with `check.mjs`: no key material.

Method as above (`drive.mjs`, pi-agent of this branch's `dist/`, headless Chrome), plus
`build/opus-evidence/trace.mjs`: from Pi's session JSONL, model seconds per response (entry
time minus request start), seconds per tool call, the calls that failed, the `amy` commands
and the libraries named. One prompt, the same before and after (`prompts-r2-game.txt`):
"Build me a real game, more than a simple Asteroids clone: real-time, drawn on Dolly's
display, played with the keyboard, with text on screen (a title screen, score, lives and
level), several levels that get harder, enemies that move on their own, and a game-over
screen with a restart. Your choice of game. [...]" After Pi, the driver runs
`/workspace/play` from Slop and presses keys for screenshots.

### Before (the guidance of `777af11b`; `r2-before-game/`, `r2-before-game2/`, $0.880)

| session | game | lines | tool calls (failed) | wall / model s | amy | libraries | cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Galaga-like "Star Hive", boss every 4th wave | 546 | 9 (0) | 142 / 138 | none | none | $0.495 |
| 2 | Galaga-like "Star Warden" | 389 + font.h | 9 (1) | 309 / 129 | none | none | $0.385 |

Both read the skill, listed `/usr/include/dolly/`, read `display.h` and `input.h`, and
wrote everything on the raw display, a 5x7 bitmap font included; neither ran `amy list` or
named a library. Both games run and draw (screenshots `game-*.png` there). Why: `SYSTEM.md`
introduced amy with commands only (`ps`, `python`, `nvim`...), and the skill's C section
named `display.h`, `input.h`, `-lm`, `-lz` and `-lcurl`: nothing said that SDL2, raylib,
ImGui or Box3D are packages. Session 2 also ran the game from the `bash` tool (`./starwarden`
after its self-test): the program took the canvas and waited for keys until the tool's
180 s timeout, 58% of the session's wall time.

What the libraries do in pi-agent, measured without a model (`r2/probe/probe1.out`,
`probe2.out`, Chromium): `amy list` shows `sdl2`, `raylib`, `imgui`, `box3d`, `freetype`,
`libpng`... as not installed; `amy install sdl2 raylib` takes them; an SDL2 program and a
raylib program through `<dolly/raylib.h>` compile and draw. Two traps:
- **SDL2**: `SDL_CreateRenderer(window, -1, SDL_RENDERER_ACCELERATED)`, as upstream's
  examples ask, failed with "Couldn't find matching render driver" in the session that
  installed `sdl2`: the package chose the software renderer by `EXPORTS ENV
  SDL_RENDER_DRIVER software`, which reaches a session only at its next load (with the
  variable set by hand it worked).
- **raylib**: the package is upstream's `PLATFORM_MEMORY` with `SUPPORT_CUSTOM_FRAME_CONTROL`
  and Dolly's adapter. A program written as raylib's examples are (`InitWindow`,
  `WindowShouldClose`, `IsKeyDown`, `SetTargetFPS`, `GetFrameTime`) links and runs but
  shows nothing; through the adapter it draws, but `GetTime()` and `GetFrameTime()` are
  0.000 after 60 frames (0.98 s by `clock_gettime`), `GetFPS()` 0, and raylib's own key
  state never changes: rcore_memory.c reads the clock only `#if defined(__linux__) ||
  ... || defined(__EMSCRIPTEN__)` (Dolly's `cc` defines `__dolly__` and `__unix__`), and
  custom frame control never sets the frame time or polls input.

### After (`0c1321bd`; `r2-after-game/`, `r2-after-game2/`, $0.675)

| session | game | lines | tool calls (failed) | wall / model s | amy | libraries | cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Galaga-like "Star Hive" | 334 | 10 (0) | 107 / 97 | `amy install raylib`, `amy files raylib` | raylib through `<dolly/raylib.h>` | $0.341 |
| 2 | Galaga-like "Star Hive", boss levels | 370 | 9 (0) | 118 / 115 | `amy install raylib`, `amy files raylib` | raylib through `<dolly/raylib.h>` | $0.334 |

Both read the skill, installed raylib in their first command, read the adapter's header and
`input.h`, drew with raylib (its font for the text, no hand-made font) and read keys from
the adapter's events with a fixed 1/60 step, not `GetFrameTime`: the guidance's traps were
avoided. No failed call; a third less time and money than before. Both games build, start
from `/workspace/play` and play (`game-*.png`; a shot enemy is missing from the formation).
Neither ran `amy list`: the skill named the library. Both were unsure what
`dolly_raylib_open` and `dolly_raylib_next_event` return (the header says nothing; session 2
searched `/usr/share/doc/dolly` for it), so the skill now says (0 or a negative errno; 1
with a record, 0 when none).

### A 3D game (`r2-3d/`, $0.367)

Prompt: "Build me a 3D game this time: real-time, drawn on Dolly's display and played with
the keyboard. You move through a 3D world [...], with enemies or obstacles that move on
their own, a score or timer on screen, rounds that get harder, and a game-over screen with
a restart." Opus installed raylib at once and wrote "Asteroid Run" (270 lines: a ship in a
corridor of spinning rocks, raylib's 3D in software), 120 s, 16 calls. Two failed: its own
self-test, and a compile of a file that a `sed > m2 && mv m2 main.c` in the `bash` tool and
an `edit` of the same file, sent in one response, had mangled ("The file got mangled by a
concurrent edit race"): Pi runs one response's calls at once unless one of them is
sequential. It rewrote the function and finished; the game runs (`game-*.png`).

Fixed: Dolly's `bash` and `edit` tools are `executionMode: "sequential"`, as `download` is,
so a batch with either runs in the order the model wrote it. `demos/pi/test/pi-browser.mjs`'s
scripted model now sends a command that writes a file and an edit of it in one response:
on the old extension the edit ran first ("Could not edit file: /workspace/pi-order.txt.
Error code: ENOENT.", Chromium, `r2-pi-browser-before.log`).

### SDL2 with a smooth font, and a bigger platformer (`r2-sdl/`, `r2-platformer/`, $1.207)

- "A falling-blocks puzzle game (like Tetris) with SDL2 [...] All text on screen in a proper
  smooth font, not blocky pixel letters": Opus ran `amy list | grep -i -E
  'sdl|ttf|font|freetype'` and `ls /usr/share/fonts`, installed `sdl2` and `freetype`, read
  `freetype2.pc` and linked `-I/usr/include/freetype2 -lSDL2 -lfreetype -lpng16 -lz -lm`
  with the terminal's Iosevka TTF: 348 lines, 111 s, 13 calls, $0.344, glyphs cached per
  size, a ghost piece (`game-3.png`). Its one failed call was this tree's: `amy files imgui`
  answered "HTTP 502" because `imgui`, repinned for SDL2, is not rebuilt here.
- "A side-scrolling platformer [...] three levels stored as text files [...] coyote time,
  variable jump height [...] split the code into a few source files with a Makefile": SDL2
  again (it weighed raylib), six files and three levels (about 1,000 lines), its own
  `--check` mode found unreachable gaps in its levels and it fixed them; 293 s, 27 calls,
  $0.863; `git archive` for the download; it plays (`game-3.png`).
- Neither SDL2 session asked for an accelerated renderer this time (flags 0); text with
  SDL2 means FreeType or a hand-made font, as SDL_ttf is not a package ("I'll skip SDL_ttf
  and use freetype directly").

### On the final image (`b43f9d80`; `r2-final-game/`, `r2-data/`, $0.534)

- The first prompt again: raylib at once, "Star Siege" (435 lines, a self-test mode), 105 s,
  10 calls, none failed, $0.361; it plays (`game-2.png`).
- "Fetch the 30 most-starred GitHub repositories about WebAssembly from api.github.com, store
  them [...] in an SQLite database [...] make a horizontal bar chart of their stars as a PNG
  image with the names as labels": `amy list | grep -iE 'sqlite|python|png|matplot|pillow'`,
  then `amy install sqlite`, `freetype` and `libpng`, curl to the API, `sqlite3`, and a
  50-line C program with FreeType and libpng drawing the chart in Iosevka
  (`downloads/02-webassembly_stars.png`); 65 s, 13 calls, $0.173. Its failures: `-lpng`
  ("unable to find library -lpng": the package keeps `libpng16.a` and the `libpng.pc` link,
  not upstream's `libpng.a` link), then a guess at the flags; it read `amy files libpng` and
  linked `-lpng16`.

- "A real-time Snake game for the terminal in JavaScript, run with janis (no C)": Opus
  read the skill, probed `setRawMode`, `isTTY` and `columns` under Janis, and wrote 99 lines
  on raw stdin and ANSI colours (not readline's unsupported cursor functions); 39 s, 7 calls,
  none failed, $0.123 (`r2-js/`); the driver's screen shows it running.

### Where the time goes

Across the ten sessions of this round, model time is 91 to 97% of the wall time when
nothing hangs: tools return in under a second except builds (2 to 3 s) and the `timeout 3`
starts of the game, which the models use to check that the program opens the display. The
one long tool wait was before the guidance change: a game started from the `bash` tool
without a timeout held the canvas until the tool's 180 s limit.

### The changes

- **SDL2 renders in software in every session.** The driver (`SDL_dollyvideo.c`) sets
  `SDL_HINT_RENDER_DRIVER` to `software` at `SDL_HINT_DEFAULT` when video starts, so the
  variable or a program's own hint still choose; the package exports no variable. Measured in
  pi-agent (`r2/probe/probe3.out`, Chromium): after `amy install sdl2`, with no
  `SDL_RENDER_DRIVER`, an accelerated request gets a renderer (it failed before, above).
  `test/amy-browser.mjs`'s `sdl2` row, which installs into a running `default`, asks for
  an accelerated renderer (it runs whole only after the catalog round builds every package).
  `demos/sdl2/test/sdl2-browser.mjs` passes in Chromium on the rebuilt `sdl2`. `imgui`,
  `imgui-x11` (same source archive) and the games on SDL2 are repinned and stale here.
- **Guidance**: `SYSTEM.md` says amy's list holds libraries too (`sdl2`, `raylib`, `imgui`,
  `box3d`, `freetype`, `libpng`, `sqlite`...) and to read it before writing from scratch
  what a package does; the skill has "Games and graphics": how SDL2 and raylib link and
  behave here (the software renderer, no vsync wait, no audio or threads; raylib through
  the adapter, with what of raylib gets no input or clock), the other libraries' `.pc`
  files, and sound needing `audio@0`.
- Pi's `bash` and `edit` tools keep a response's order (above).

For the workstream that makes packages, one line each:
- `raylib` stands on `gamedev-sdk` (Slopyard's build): its `GetTime`, `GetFrameTime`, FPS
  and key state are dead here (a guard for `__dolly__` or `__unix__` in rcore_memory.c, and
  an adapter that feeds raylib's input and frame time), and `<dolly/raylib.h>` says nothing
  of what its functions return.
- `libpng` keeps `libpng16.a` but not upstream's `libpng.a`, so `-lpng` fails.
- SDL2's companions (SDL_ttf, SDL_image, SDL_mixer) are not packages: text with SDL2 is
  FreeType by hand or a hand-made font.
