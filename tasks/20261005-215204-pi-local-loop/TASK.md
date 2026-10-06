# pi-local repeats its second tool call forever

- STATUS: CLOSED
- PRIORITY: 345
- TAGS: pi-local,local-llm,bug,agent

Owner (2026-10-06, release candidate on :9003): "both chrome and firefox gets
stuck on like the second tool call forever (just keep doing ls -la /workspace
on repeat)". Asked: reproduce with Playwright in both browsers, fix, then have
the agent audit its own environment.

## Reproduction

Rig: headed Chrome 151 and the installed Firefox 156 under `Xvfb :133`,
NVIDIA adapter. Interactively (Pi's TUI from the image's init) the task "List
the files in /workspace, create hello.c that prints the numbers 1 to 5,
compile it with cc and run it, then tell me the output" looped in the first of
three runs: the same text and `cd /workspace && /bin/slop cc hello.c &&
/workspace/hello` over and over, through compaction. For statistics the rig
instruments the provider's client in the session (every request and
completion to a file) and runs Pi's own loop, `pi -p`, from `/` as init starts
Pi, one fresh session per trial (evidence:
`build/pi-local-evidence/trials/*/evidence.json`).

| Build | Sampling | Trials | Completed | Identical-call loop (longest run) |
| --- | --- | --- | --- | --- |
| candidate :9003 (Pi 1.0.3, f32 engine) | temperature 0.2, top_p 0.9, top_k 20, seed 42 every request | 8 | 5 | 3 (102, 102, 117 identical calls) |
| deployed :9002 (Pi 0.99.2, old skill, f16 engine) | same | 6 | 4 | 2 (56, 79) |

## Cause

- The loop is generated from prompts that contain each previous identical
  call and its result: the provider renders Qwen's chat template correctly
  (`<tool_response>` user turns), and the engine reuses the previous request
  exactly (cached = previous input - ~21 tokens; each repeat adds ~100). A
  2B model at temperature 0.2 copies its previous turn, and with the same
  seed (42, the engine's default; the provider sent none) for every request
  a self-similar context replays the same draws: five of eight candidate
  trials were byte-identical runs. Qwen recommends temperature 0.7-1.0,
  top_p 0.8-1.0, top_k 20 and presence_penalty 1.5-2.0 "to reduce endless
  repetitions" (Qwen3.5-2B model card); MiniCPM5 temperature 1.0, top_p 0.95.
- Neither Pi 1.0.3 nor the provider bounds identical consecutive tool calls
  (Pi has no setting; its `tool_call` extension hook can block a call and end
  the run).
- Not a regression: the deployed release loops at the same rate. The KV-cache
  reuse is sound for this hybrid model (llama's recurrent `seq_rm` refuses a
  partial rollback with 0 snapshots, so a divergence re-evaluates from
  scratch). The f32 shaders and the queue-wait changes do not enter.
- Triggers seen in the transcripts, all environment confusion: `cc hello.c`
  writes `a.out`, then `./hello` gets `slop: ./hello: command not found`,
  which the model reads as "the slop shell is not installed"
  (`20261005-225439-slop-path-not-found`); and Pi runs in `/` (the init
  script is non-interactive, so Slop does not move it to `/workspace`), so
  every bash call starts in `/` although SYSTEM.md says to work in
  `/workspace`.

## Fix

- `models.json` carries each publisher's recommended sampling (Qwen3.5:
  temperature 0.7, top_p 0.8, top_k 20, presence_penalty 1.5; MiniCPM5:
  1.0, 0.95); the provider sends it, Pi's own temperature wins when set.
- `dolly-llama` takes `top_k` and `presence_penalty`, and samples with a
  fresh seed per request unless one is given.
- The provider registers Pi's `tool_call` hook: a third identical call after
  two identical results is not run and the model reads why; a fourth ends the
  run and tells the user in one line. It belongs at the agent loop, not in
  the transport (`streamSimple`): Pi 1.0.3 has no setting for it, and its
  `tool_call` hook (block, reason, terminate) is the documented place. Pi
  itself should own such a bound eventually, since any model can loop.

## Verification (2026-10-06, `pi -p` from `/`, fresh session per trial)

The final image (commit `3ccbdd9d`, served from this worktree) against the
candidate's sampling, same task, same rig:

| Model, browser | Sampling | Bound | Trials | Completed | Stopped by the bound | Other |
| --- | --- | --- | --- | --- | --- | --- |
| 2B, Chrome (candidate) | 0.2 / 0.9 / k20, seed 42 | none | 8 | 5 | - | 3 loops of 102-117 identical calls |
| 2B, Chrome (deployed, Pi 0.99.2) | same | none | 6 | 4 | - | 2 loops of 56, 79 |
| 2B, Chrome | 0.7 / 0.8 / k20 / presence 1.5, fresh seed | stop at 3rd | 8 | 6 | 0 | 1 non-identical wander (timeout), 1 context overflow |
| 2B, Chrome, Pi in `/workspace` | same | stop at 3rd | 8 | 5 | 2 (`ls -la /workspace/` x3) | 1 context overflow |
| 2B, Chrome | same | final | 8 | 8 (13-27 s) | 0 | 0 |
| 2B, Firefox | same | final | 4 | 4 (89-183 s) | 0 | 0 |
| MiniCPM5, Chrome | 1.0 / 0.95, fresh seed | final | 4 | 3 | 1 | 0 |
| 0.8B, Chrome | Qwen's | final | 4 | 0 | 4 | 0 |

"Final" bound: the third identical call after two identical results is not
run (the model reads "Not run: this bash call already returned the same
result twice. Use that result or do something else."); repeating it once more
ends the run with "Stopped: the model repeated the same bash call 4 times
with the same result." shown to the user. The 0.8B model ignores the notice
and is stopped every time; it is not a dependable agent. No run looped.

Remaining failures are the model's, prompted by the environment:
`slop: ./hello: command not found` for a missing path (every model, task
`20261005-225439-slop-path-not-found`); Pi's cwd `/` while each bash call
starts there (`<cwd>/</cwd>` in the system prompt); `ls -la` printing
`d       4096 2026-10-06 00:20 .`, which the 2B model read as a file named
`d` (`ls -la /workspace/d/`) and which small models re-run because an empty
directory does not look empty; `cat a.out` putting a 28 KB WebAssembly binary
into the context, after which Pi's compaction cannot recover ("The request
exceeds the available context size").

## Self-audits (2026-10-06)

The agent in the fixed `pi-local` audited its machine (`pi -p` with a
six-step prompt: list directories, compile C, run JavaScript, curl
example.com, a Git commit, try `chmod`/`python3`/`make`, then write
`/workspace/AUDIT.md`). Copies: `build/pi-local-evidence/audits/`
(`qwen3.5-4b-AUDIT.md`: Chrome with the optional Dawn f16 flag, 470 s,
15 tool calls; `qwen3.5-2b-AUDIT.md`: Chrome default, 47 s, 13 calls).

Read against the logged turns:

- Qwen3.5-4B did all six steps; its report matches its tool results.
  Findings: `curl https://example.com/` fails ("Browser could not fetch the
  URL: blocked (no CORS headers, or a redirect) or unreachable"), which it
  calls "network blocked by the sandbox": the message is right (example.com
  sends no CORS headers; `docs/http.md`), the reading is the model's.
  `chmod` is missing: an environment defect, because `help` says chmod
  "changes nothing" (task `20261006-005303-ls-long-format`).
- Qwen3.5-2B ran five commands and then wrote results it never obtained
  (janis and curl "worked", make "not found", chmod "permission issues").
  What it did see: `cc hello.c && ./hello` gave `slop: ./hello: command not
  found` (task `20261005-225439-slop-path-not-found`), then `file /bin/cc`
  said "WebAssembly binary module", from which it concluded "cc is not a C
  compiler". Model limit, prompted by two environment facts.

Environment defects filed: Slop's message for a missing path
(`20261005-225439-slop-path-not-found`), Pi's working directory
(`20261006-005303-pi-cwd`), `ls -l` format and the missing `chmod`
(`20261006-005303-ls-long-format`). Model limits: fabricated audit results
(2B), ignoring the skill's location and the "Not run" notice (0.8B), reading
a binary into the context (`cat a.out`, after which Pi's compaction keeps the
blob and the request still exceeds the context).

Where one sentence in the `dolly` skill or `SYSTEM.md` would have saved the
small models: "`cc file.c` writes `a.out`; use `cc -o NAME file.c` and run
`./NAME` in the same command, since each bash call starts in Pi's working
directory"; "every program here, `cc` included, is a WebAssembly module, so
`file` says so"; and "do not `cat` a compiled program".

Closed: the loop's cause is fixed and bounded (commit `3ccbdd9d`), the browser
test proves a multi-turn agent run in Chrome and Firefox (`29843156`), and
the environment findings are filed. Sizes: 2B 8/8 (Chrome) and 4/4
(Firefox); MiniCPM5 3/4; 4B completes the six-step audit in Chrome with the
f16 flag but needs f16 (its f32 KV cache exceeds `gpu@0`'s 4 GiB), and its
Firefox run stalled under the machine's memory pressure; 0.8B never
completes and is stopped by the bound every time.
