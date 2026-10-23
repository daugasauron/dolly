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

## State (2026-10-23 13:45 JST, branch `demo/pi-local-smooth`)

Before measured with Qwen3.5-2B; MiniCPM5-2B running. A candidate fix (guidance for local
models in `demos/local-llm/`) is written and not measured yet.

## Method

`build/pilocal-evidence/drive.mjs` (not committed): `pi-local` of `e936ac95` served by the
checkout server, Chrome 151 on the RTX 5070 under Xvfb :151, a person's prompts typed into
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

`amy` was used in none of the 18 sessions; the `dolly` skill was read in one, after a first
try at a path it made up (`~/.pi/agent/extensions/dolly/SKILL.md`, from the prompt's
`~/.pi/agent/extensions/`). The longest prompt was 7,991 tokens of 16,384.
