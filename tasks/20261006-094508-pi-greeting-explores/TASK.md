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
