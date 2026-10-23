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
