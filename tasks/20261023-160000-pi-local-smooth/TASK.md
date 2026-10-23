# pi-local: Pi on a local model, smooth in use; the model is confused about the environment

- STATUS: OPEN
- PRIORITY: 180
- TAGS: pi,local-llm,agent-experience,0.1.4

Owner (2026-10-23): "make the pi agent with the local model (pi-local) smoother. Try to use
it and inspect the output to make it nice, now the model seems quite confused about the
environment."

`pi-local` (`demos/local-llm/Dollyfile-pi-local`) is `pi-agent` with local models
(`qwen3.5-2b`, `minicpm5-2b`) served in the page over `gpu@0` by
`demos/local-llm/local-model-provider.js`; it reads the same Dolly guidance as `pi-agent`
(`demos/pi/SYSTEM.md`, the `dolly` skill, `dolly-tools.js`), written for large models.

Done when: sessions of the kinds a person starts (ask what is here, read and edit a file,
run a command, build a small C program) are recorded before and after with each model, the
causes of the confusion are named from those transcripts, the fixes are in and measured
the same way, and `demos/local-llm/test/local-llm-browser.mjs` passes on the GPU in Chromium
and Firefox.

## State (2026-10-23 16:05 JST, branch `demo/pi-local-smooth`)

Before measured with both models; the first candidate measured with Qwen; the second
candidate (`ef147433`) is built into `pi-local` and `dollyfile-studio` in this tree and
waits for the shared GPU lock with its measurement and `local-llm-browser.mjs`
(`build/pilocal-evidence/batch1.sh`, unit `dolly-pilocal-batch1`).

Building in this slim tree: `npm run image` stages the whole closure of `pi-local`, and
that needs Rust's port sources (`build/rustc-port`), which the tree lacks. Only
`provider.tar` changes, so it is staged with the command of
`demos/local-llm/prepare-sources.sh`, then `DOLLY_BUILD_IMAGES=pi-local
update-recipe-pins.mjs --sources`, `generate-routes.mjs` and `build-system-snapshot.mjs`
(`DOLLY_BUILD_IMAGES=default,pi-local,minicpm5-2b,dollyfile-studio`, hugebuild slot): the
same steps as `build-image.mjs` without restaging the unchanged sources. `pi-local` and
`dollyfile-studio` were rebuilt, nothing else.

## Method

`build/pilocal-evidence/drive.mjs` (not committed): `pi-local` of `e936ac95` served by the
checkout server, Chrome 156 on the RTX 5070 under Xvfb :151, a person's prompts typed into
Pi, each in a new session (`/new`), the workspace reset to one `notes.txt` before each with
`!!` (not in the model's context). Three rounds of six prompts per model: "what is in this
directory?", "Read notes.txt and move the next meeting to Thursday.", "which processes are
running right now?", "Write a small C program that prints the first 10 Fibonacci numbers,
build it with cc and run it.", "which programming languages can I use here?", "Run a Python
one-liner that prints 2+2.". A capture extension records each provider request (what the
model is sent); Pi's session files hold the calls and results. Per model and run, under
`build/pilocal-evidence/TAG/MODEL/`: `transcript.md` (`transcript.mjs`), the last screen and
every distinct screen per session, screenshots, `requests.jsonl`, `engine.log`.

## Before, Qwen3.5-2B (`build/pilocal-evidence/before/qwen3.5-2b/`)

| Prompt | Right | Tool calls (3 runs) | What happened |
| --- | --- | --- | --- |
| what is in this directory? | 3 of 3 | 1, 1, 2 | `ls -la` |
| edit notes.txt | 3 of 3 | 2, 2, 2 | `read`, `edit` |
| which processes | 0 of 3 | 5, 6, 3 | `ps auxf`, `ps -o … --no-headers`, `pgrep`, `/proc/1/cmdline`, `curl http://localhost`; "no process tools in this sandbox" |
| C program | 3 of 3 | 2, 3, 3 | `write`, `cc -o fib fib.c`, `./fib` (one run left out the second 1, a bug of its own) |
| which languages | 0 of 3 | 7, 15, 0 | two runs answered from memory: Python, "Assembly (x86/x86_64)", Rust; one read the skill after 14 calls and still said "No Git" |
| Python one-liner | 0 of 3 | 6, 30, 28 | `python3`, `pip3 install`, `apt-get install`, `/etc/os-release`; one wrote `print_2plus2.py` and said it would print 4 |

The `dolly` skill was read in two sessions, once after a path it made up
(`~/.pi/agent/extensions/dolly/SKILL.md`, from the prompt's `~/.pi/agent/extensions/`);
`amy` came up only in the third Python run, after the skill, between `pip3` scripts that Pi's
repeat guard stopped. The longest prompt was 7,991 tokens of 16,384.

## Before, MiniCPM5-2B (`build/pilocal-evidence/before/minicpm5-2b/`)

Installed with `amy` and made Pi's default before Pi starts: a model chosen with `/local`
lasts one Pi session (below), so the first attempt at this run measured Qwen after `/new`.

| Prompt | Right | Tool calls (3 runs) | What happened |
| --- | --- | --- | --- |
| what is in this directory? | 3 of 3 | 2, 6, 2 | one run also ran `find / -name "*.txt"` and read the skill |
| edit notes.txt | 3 of 3 | 2, 3, 3 | one run rewrote the file with a here-document |
| which processes | 0 of 3 | 5, 1, 0 | `ps -ef 2>/dev/null`, `/proc/1/cmdline`; "there are currently no processes running" from an empty `ps … 2>/dev/null \| head`; "I don't have access to your host system's process list" |
| C program | 3 of 3 | 1, 9, 7 | two runs left out `#include <stdio.h>` and fixed it after `cc`'s error |
| which languages | 0 of 3 | 0, 0, 0 | from the prompt's words: "use the `pi` skill… use `am`", "`slop python3 --version`", "`npm`, `cargo`", "Python" |
| Python one-liner | 0 of 3 | 0, 2, 27 | no call ("Python can print 2+2 by evaluating the expression"); "Python isn't installed", `echo $((2+2))`; 27 calls through `/usr/bin`, `slop --version` and the provider's source until Pi compacted at 75 % of 16k |

The skill was read in two sessions; `amy` came up only in the third Python run.

## Causes, from these transcripts

1. **What the machine has is only in the skill, and a 2B model does not read the skill.**
   `SYSTEM.md` says the `dolly` skill explains "how to find out what it has; read it when a
   task involves one of those". Both models read it in 2 of 36 sessions, one after making up
   its path. Without it they fall back on Linux: `ps aux`, `pgrep`, `/proc/1/cmdline`,
   `python3`, `pip3 install`, `apt-get`, `/etc/os-release`, `which`. Nothing in the prompt
   names `amy`, the installed commands or `/proc/processes`. `amy` came up in 2 of 36
   sessions, each late in a run of 27 or more calls, and there `amy install python` fails: the
   package needs `dso@0` and `sockets@0`, which `pi-local` does not declare, as amy said.
2. **The conversation rule sends questions about the machine to the model's memory.** "When
   the user greets you, thanks you or asks a general question, just reply in plain text"
   (written after `pi-greeting-explores`) makes "which programming languages can I use
   here?" a general question: 4 of 6 answers had no tool call and named Python, x86
   assembly, Rust, `npm`, `cargo`, none installed.
3. **Prose written for a large model is repeated back as facts.** MiniCPM turns the skill's
   description and the prompt's Pi lines into answers ("use the `pi` skill… use `am` for
   fetching source", "`slop python3 --version`"); Qwen looked for the skill under
   `~/.pi/agent/extensions/` and for the languages in `/usr/src/pi-source`, both named in
   `SYSTEM.md` only for Pi's own extensions and documentation.
4. **Errors are hidden by the model's own habits.** `ps -e … 2>/dev/null | head -50` printed
   nothing and the answer was "no processes are running"; Slop's `command not found` (status
   127) is the only sign, and `2>/dev/null` and `| head` remove it.
5. **Not causes here:** the context (the longest prompt 11,769 of 16,384 tokens, only in a
   27-call Python search that ended in Pi's auto-compaction), the tool results' form (Pi's
   plain output and `Command exited with code N`), and C: both models wrote, built and ran
   the program in 6 of 6 runs. The sampling (Qwen 0.7 / top-p 0.8 / presence 1.5, the
   publisher's; MiniCPM the GGUF's temperature 1.0) did not show as a cause: the same
   wrong commands come at every round.
6. **The tools say Bash.** Pi's `bash` tool tells the model "Execute a bash command"
   (`createBashToolDefinition`), beside `SYSTEM.md`'s "runs Slop, not Bash". No transcript
   shows a Bash-only construct, so this is a proposal, not a measured cause.

Found on the way, both in `pi-local`'s provider:

- **A model chosen with `/local` lasts one Pi session.** An extension's `pi.setModel` is
  session-only (Pi's `/model` persists with `persist: true`), so after `/local` → MiniCPM,
  `/new` or the next Pi is on Qwen again, and the engine swaps the model back.
- **Every `/new` reloads the model.** Pi loads its extensions again for each session; the
  provider stopped its engine on every `session_shutdown`, so each new session waited 3 to 5 s
  for the weights and evaluated its 1,600-token prompt from nothing (18 loads in 18
  sessions in `engine.log`).

## Fixes, in `pi-local`'s own files

- `demos/local-llm/SYSTEM.md`, installed as `/usr/lib/dolly-llm/SYSTEM.md`: guidance for a
  small model. It states the facts the transcripts lacked (not Linux, no apt, pip or npm,
  `/proc/processes`, every bash call in Slop from `/workspace`, `amy list` and
  `amy install`, `cc -o NAME FILE.c && ./NAME`, `janis`), and that questions about the
  machine are answered from the prompt, tasks with tools. Nothing about Pi's own
  documentation, extensions or npm.
- `local-model-provider.js`: a session whose first prompt goes to a local model gets that
  guidance in place of `SYSTEM.md`'s preamble (Pi's `before_agent_start`,
  `systemPromptOptions.customPrompt`) and a `commands` section with the commands on `PATH`,
  read once per session. The choice and the list hold for the session: a changed prompt
  would reach the model as a later system message, which Qwen3.5's template refuses
  ("System message must be at the beginning"). Hosted models chosen with `/model` keep the
  general guidance. The skill stays listed.
- `/local` saves the model it switches to as Pi's `defaultProvider`/`defaultModel` in
  `~/.pi/agent/settings.json`, as Pi's `/model` does; Pi's settings writes merge only the
  fields Pi changed, so the value stays.
- One engine per Pi process (`globalThis`), stopped on `session_shutdown` only when Pi
  quits: `/new` and `/resume` keep the model loaded.

## Proposals for the shared guidance (`demos/pi/`, with `pi-dolly`)

Not changed here: each rebuilds `pi` and every image on it.

- `dolly-tools.js`: give the shell tool a description that says Slop, not Pi's "Execute a
  bash command"; the tool's name stays `bash`.
- The `dolly` skill, "What this machine has": name `/proc/processes` for the process list,
  and that `amy install` names the host module an image lacks (`python` needs `dso@0` and
  `sockets@0`, which `pi-agent` and `pi-local` do not declare).

## First candidate, Qwen3.5-2B (`build/pilocal-evidence/after1/qwen3.5-2b/`, the image of `83fd8918`)

Guidance in prose ("You are a coding agent in Dolly…", copy at
`build/pilocal-evidence/SYSTEM-after1.md`) and the commands as a section after the working
directory. Three rounds, the six prompts and three greetings:

- Better: the languages, 3 of 3 from the prompt (C, C++, JavaScript; one added "a Python
  environment"); greetings without tool calls, 9 of 9; the engine loaded once for 27
  sessions (18 loads for 18 before).
- Not better: processes 0 of 3 (`ps aux` first every time, then `/proc/1/cmdline`,
  `janis -c`); Python 0 of 3 (ran `print(2 + 2)` as JavaScript with `janis` and reported
  "the Python one-liner prints 4"; wrote a `.py` file and said what it would print); one
  C run called `gcc`, `janis fib.c` and `python3`; one edit spent 45 calls on `date -d
  "Thursday, October 24"`.
- New confusion: "I am Dolly, a Unix-like system…" in 4 of 6 greetings, from "You are a
  coding agent in Dolly" and "questions about yourself or this machine".

So the facts must be where the model looks at the moment it fails, and the prompt must not
blur the assistant with the machine. Second candidate: a short list of how things are done
here with the command list inline, "You are a coding assistant. The machine you work on is
Dolly", and a line appended to a bash result that says `NAME: command not found`: the name
is not installed, the prompt lists what is, `amy list` shows the packages. Measured with
the shipped sampling and with temperature 0.6, top-p 0.95 and (Qwen) presence penalty 0.

## `local-llm-browser.mjs` on the GPU (2026-10-23 16:05-16:21 JST, `ef147433`)

Xvfb :151, RTX 5070, Chrome 156.0.8078.47 and Firefox 157.0.1 (as the test records them), `pi-local` and `dollyfile-studio` built
from `ef147433` in this tree: passed, exit 0 (`build/pilocal-evidence/test-gpu.log`,
screenshots in `build/pilocal-evidence/test-gpu-proof/`). The agent proof ran with the new
guidance: 4 tool calls in 15.6 s in Chrome, 4 in 106 s in Firefox, first attempt each. The
test now types `/new` after choosing MiniCPM with `/local` and changing its parameters, and
the next task must run on MiniCPM (its tokens/s line): passed in both browsers and both
images. Without the saved default that session would start on Qwen.
