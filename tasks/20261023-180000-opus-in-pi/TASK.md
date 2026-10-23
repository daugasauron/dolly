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
- **amy says the compiler is not installed**: in pi-agent `amy list` shows `cc` and `make`
  as `-` and `amy info cc` says "not installed", while `command -v cc make` finds `/bin/cc`
  and `/usr/bin/make` and `cc --version` works. Opus noted it; a model may reinstall 125 MB.
- **`test -nt`, `-ot`, `-ef`**: `touch a; sleep 1; touch b; [ b -nt a ]` prints
  "[: unsupported expression", status 2 (all three are POSIX.1-2024). Opus's play script used
  `[ guess.c -nt guess ]`.
- **`which NAME` for a missing command**: `which python3` prints "which: python3: not an
  external command", status 2 (sbase's wording), which reads as if it were a builtin.
- **`tar -czf`** (the `tar` package): `tar -czf x.tgz d` prints "tar: fork: Function not
  implemented", status 1. Explicit, but it could say that `-z` is unsupported here.

## For the owner

- pi-agent and pi-local declare neither `dso@0` and `sockets@0` nor `nena@0`, so
  `amy install python` cannot work there (Opus now says so); add `nena@0` as `default` has?
- `exec PROGRAM` at the end of a wrapper script fails ("replacing the shell with a command is
  unsupported"); Opus's first `play` used it. Run it as a child and exit with its status?
- `ls /proc` finds nothing while `cat /proc/processes` works (documented); models read the
  first as "no process list". Should `/proc` list `processes`?

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
