# Pi explores the environment unprompted: a plain 'hi' sets off many commands

- STATUS: OPEN
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
events; "after" overwrites `~/.pi/agent/SYSTEM.md` and the skill in the running
image with the new wording. Logs: `build/pi-greeting-evidence/runs/`.

Hosted, `pi` image, OpenRouter `deepseek/deepseek-v4-flash`, ten runs each
(runs without a tool call / tool calls in total):

| Message | Before | After |
| --- | --- | --- |
| hi | 10 of 10 / 0 | 10 of 10 / 0 |
| what can you do here? | 0 of 10 / 40 | 10 of 10 / 0 |
| thanks | 10 of 10 / 0 | 10 of 10 / 0 |

Before, every run of the question read the skill (its description opened with
"How to work on this Dolly machine … finding what is installed") and six of
ten then ran its discovery commands as a tour (`cat /etc/dolly/Dollyfile`,
`ls /bin /usr/bin`, `amy list`; up to 11 calls). So for a capable model the
prompt was the cause, on questions about the machine rather than on a
greeting. After, the question is answered from the system prompt in a few
lines, and the agent is not passive: "install ripgrep with amy and use it"
read the skill, installed and searched in 3 calls. Spend: 0.03 USD.

## Wording

- `demos/pi/SYSTEM.md`: a new paragraph, "Answer a greeting, thanks or a
  question directly and briefly, from what you already know. Use tools only
  when the user's request needs them; do not look around the machine before
  you have a task.", and the skill pointer turned from an order ("Read the
  `dolly` skill before you …") into a condition ("When a task is to install
  software, … read the `dolly` skill first").
- The `dolly` skill's description now says when to read it ("Read it only
  when a task needs you to install software, fetch source code, compile, or
  diagnose a command that failed here; not for conversation") and then what it
  covers. The body is untouched.
- Pi's own prompt is not the push: Dolly's `SYSTEM.md` replaces Pi's preamble,
  tool list and rules (`system-prompt.ts`). What Pi still adds and
  `SYSTEM.md` cannot change is the skills section ("Use the read tool to load
  a skill's file when the task matches its description") and the working
  directory, so the description is the only lever on when a skill is read.
