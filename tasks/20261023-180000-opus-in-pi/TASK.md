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
