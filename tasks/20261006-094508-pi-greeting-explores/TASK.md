# Pi explores the environment unprompted: a plain 'hi' sets off many commands

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: pi,pi-local,skills,agent-experience

Owner (2026-10-06, `pi-local` with the bundled Qwen3.5-2B on localhost): "I
just said hi and it started running many many commands to investigate the
environment, it seems the current skill/prompts are way too direct on it
starting to investigate the env, the skills/docs of dolly should be
instructive so it can do its job, but it shouldn't start exploring by
default. I'm not sure if it's just that this local model isn't good enough or
if there is a problem."

What the model is given today: `demos/pi/SYSTEM.md` (21 lines: "You are a
coding agent inside Dolly… Work in `/workspace`… Read the `dolly` skill before
you install software, fetch source, compile, draw on the display or explain a
failing command…"), the `dolly` skill's description, which Pi puts in the
prompt, and Pi's own system prompt and tool list. Nothing tells it to explore,
and nothing tells it that a greeting needs no tools.

## Work

- Measure before changing: send "hi" (and two other messages that need no
  tools, such as "what can you do here?" and "thanks") to the image's Pi and
  count tool calls, ten runs each, for the bundled 2B, the larger local models
  and one capable hosted model, with the current prompt. If the hosted model
  also explores, the prompt is the cause; if only the small local models do,
  it is a model limit that the prompt can still soften.
- Then the smallest change that fixes it without losing what the skill is for:
  wording in `SYSTEM.md` that separates conversation from work ("answer a
  greeting or a question directly; use tools when the task needs them"), the
  skill's description stating when to read it rather than inviting a tour,
  and, for the local provider only if the numbers ask for it, a per-model note
  in the model's description. Re-measure with the same messages, and check
  that the tool-using tasks from `20261005-130240-pi-skills` and the multi-turn
  agent proof still pass: the fix must not make the agent passive.

## Done when

- The table before and after is recorded here; a greeting sets off no tool
  call in at least nine of ten runs with the bundled model, or the task states
  with evidence that the model cannot do better and what the image tells the
  user about it.
- A test covers it where it can be made deterministic (the scripted provider
  in `demos/pi/test/pi-browser.mjs` cannot judge a model; say what is tested).

## Measured (2026-10-06, `fix/pi-greeting`)

Method: the served release (`localhost:9003`), `pi --mode json --no-session -p
MESSAGE` once per run in a fresh Pi process, counting `tool_execution_start`
events, ten runs per cell; "after" overwrites `~/.pi/agent/SYSTEM.md` and the
skill in the running image with the new wording (no rebuild). Each cell is
runs without any tool call / tool calls in total. Logs:
`build/pi-greeting-evidence/runs/`.

Hosted, `pi` image, OpenRouter `deepseek/deepseek-v4-flash`:

| Message | Before | After (final wording) |
| --- | --- | --- |
| hi | 10 of 10 / 0 | 10 of 10 / 0 |
| what can you do here? | 0 of 10 / 40 | 10 of 10 / 0 |
| thanks | 10 of 10 / 0 | 10 of 10 / 0 |

Bundled Qwen3.5-2B, `pi-local` image, on the GPU:

| Message | Before | First wording | After (final wording) |
| --- | --- | --- | --- |
| hi | 7 of 10 / 6 | 0 of 10 / 13 | 10 of 10 / 0 |
| what can you do here? | 5 of 10 / 77 | 3 of 10 / 23 | 10 of 10 / 0 |
| thanks | 6 of 10 / 75 | 0 of 10 / 35 | 10 of 10 / 0 |

- Cause: the prompt, for both models. The hosted model toured only on a
  question about the machine: every run read the skill (its description
  opened "How to work on this Dolly machine … finding what is installed") and
  six of ten then ran its discovery commands (`cat /etc/dolly/Dollyfile`,
  `ls /bin /usr/bin`, `amy list`; up to 11 calls). The 2B started with `pwd`
  or `ls` on any message in about four runs of ten and then spiralled through
  the skill's commands (up to 36 calls on "thanks"; two runs ended in an
  error), which is what the owner saw.
- The 2B is far more sensitive to wording than the hosted model. The first
  wording ("Answer a greeting … directly … do not look around the machine
  before you have a task. When a task is to …, read the `dolly` skill first";
  description "Read it only when …") fixed the hosted model (30 of 30) but
  made the 2B call a tool in 27 of 30 runs: naming the unwanted action and
  starting sentences with "read" primed `pwd` and `read SKILL.md`, and one run
  overwrote the skill file. The final wording states only what to do.
- Not passive: with the final wording the hosted model did "install ripgrep
  with amy and use it" in 3 calls (skill, install, search), and the 2B did the
  agent proof's task (list, write `hello.c`, compile, run, report 1 to 5) in
  4 or 5 calls in three of three runs.
- A ten-run 2B baseline before the 19:54 reboot was lost with the browser
  session; only its timing was on disk (about 70 s a run under memory
  pressure, against 7 to 24 s afterwards). The table above is the rerun.
- Spend on OpenRouter: 0.04 USD.

## Wording (final)

- `demos/pi/SYSTEM.md`: "When the user greets you, thanks you or asks a
  general question, just reply in plain text. Call tools only to carry out a
  task the user has given you." The skill pointer is a statement with its
  condition last instead of an order: "The `dolly` skill explains how to
  install software, fetch source, compile, draw on the display and diagnose
  failing commands on this machine, and how to find out what it has; read it
  when a task involves one of those."
- The `dolly` skill's description lists what it is a reference for and ends
  "Useful only while carrying out such a task or diagnosing a failed command,
  not for conversation." The body is untouched.
- Pi's own prompt is not the push: Dolly's `SYSTEM.md` replaces Pi's preamble,
  tool list and rules (`system-prompt.ts`). What Pi still adds and
  `SYSTEM.md` cannot change is the skills section ("Use the read tool to load
  a skill's file when the task matches its description") and the working
  directory, so the description is the only lever on when a skill is read.

## Test

None added: whether a model calls a tool on "hi" is not deterministic, and
the scripted provider in `demos/pi/test/pi-browser.mjs` answers whatever the
prompt says, so a test there would only check wording. That test still
proves tools run when a model asks for them; the behaviour of real models is
the measurement above, repeatable with `build/pi-greeting-evidence/greet.mjs`
(not committed).

## Remains

The wording was measured by overwriting the two files in the served images.
After the Pi images are rebuilt with it, one batch of "hi" on `pi-local`
confirms the shipped image; close then.

## Closed 2026-10-07

`fix/pi-greeting` (`3d196a15`) is in the candidate and the Pi chain was
rebuilt on it. The shipped files are the measured ones byte for byte:
`demos/pi/Dollyfile-pi-coding-agent` pins `SYSTEM.md` at `edfd0f62…` and the
skill at `a0df62a8…`, the SHA-256 of `demos/pi/SYSTEM.md` and
`demos/pi/skills/dolly/SKILL.md` in the tree. The rebuilt `pi-local` ran the
agent proof with the bundled 2B in Chromium (4 tool calls, 11.6 s) and
Firefox (4 tool calls, 81 s) in the main round
(`work/next/build/next-evidence/gpu-local-llm-rerun.log`), so the wording did
not make it passive. The "hi" batch on the rebuilt image was not repeated: the
table above was measured on the same bytes.
