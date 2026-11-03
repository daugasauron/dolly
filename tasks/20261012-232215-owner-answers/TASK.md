# Three answers only the owner can give: Claude Code's real turn, the recordings' model, Paint's text

- STATUS: CLOSED
- PRIORITY: 70
- TAGS: owner,demo

## Closed (2026-11-03): folded into the owner's decisions

Items 2 and 3 were struck on 2026-10-27 (below). Item 1, Claude Code's real turn, is one line of
`tasks/20261102-133353-owner-decisions` ("Claude Code's real turn") since 2026-11-03: the key in
`~/.claude-api` that drew "Credit balance too low" on 2026-10-23 answered Pi's turns on the
owner's phone on 2026-11-03 (`tasks/20261010-193000-phone-voice-pi`), so the turn can be tried
again, by the owner or by an agent on his word.

## State (2026-10-27): item 1 is left

Items 2 and 3 are struck by the integrator's recommendations, which the owner accepted on
2026-10-27 ("the rest of the items go with your recommendations"): the agents page keeps its two
recordings, and Paint's text tool stays upstream's, without the two `SetFocus` calls. Item 1, a
turn with a funded organization's key, is the owner's.

Three demo tasks had nothing left for an agent but a question to the owner. They are closed
into this one list on 2026-10-13; each keeps its history, and what was verified on `main` that
day is named with it. An answer reopens the work as a task of its own; an item the owner
strikes is done. Ranked low because it waits for him.

1. **Claude Code: one real-model turn with your key**
   2026-10-23: run with the owner's API key (given in `~/.claude-api`) on the v0.1.3 release (`:9014`): Claude
   Code 2.1.112 started with `--bare`, its first `POST https://api.anthropic.com/v1/messages` went from the
   browser and the API answered "Credit balance too low · Add funds". The path works; the key's organization
   has no balance the API spends (the owner's "Promotional credits" did not cover it). Left: one turn with a
   funded organization.
   (`tasks/20261007-085236-claude-code-image`). To do, by the owner: open
   `closed-source-agent` on the domain, press Enter at the notice, paste a funded Anthropic API
   key, send one prompt, and say whether it answered. Nothing else is owed: the image fetches
   the pinned Claude Code 2.1.112 from npm only after that key press, and its browser test (the
   notice, no request for the package before the key, a file-tool turn against a scripted
   endpoint) passed in Chrome on 2026-10-13 (`closed-source-agent: chromium passed in 40.5s`,
   `work/rust/build/integrate-evidence/final-demos.log`). A made-up key drew the API's 401,
   which proves the request path and not an answer. The key goes into no file, log or task.
2. **Demo recordings: which model, and what budget** (struck 2026-10-27: the page stays as it is)
   (`tasks/20261005-131651-demo-recordings`). The agents page shows two recordings
   (`sites/slopshare.dev/agents/`: Studio, the new take, and RTS Arena, still the old Codex
   match); ClassiCube and bhop were taken off it on 2026-10-06. The owner's rule was free models
   only, and no free model played the three games visibly better than the old recordings (the
   takes are in that task). So: name a paid model and a spending limit for RTS Arena, ClassiCube
   and bhop, or say that the page stays as it is. The rig and its commands are in that task
   under "Rerun"; the key is read from `~/.openrouter` at run time and never written anywhere.
3. **Paint's text tool: what was bad about the fix** (struck 2026-10-27: Paint stays upstream's)
   (`tasks/20261010-112539-paint-text`). The bug stands: in the `wine` image Paint's text tool
   takes no typing. ReactOS Paint 0.3.17 takes the text in a window of its own and never gives
   its edit control the keyboard; typing writes after a click inside that window (measured
   2026-10-10, before the fix). Two `SetFocus` calls made typing work at once (`afd70568`) and
   were taken out at the owner's word (`2926295a`): "The \"fix\" that seemed to have been added
   in paint for text input is bad I don't want this." What was bad about it? The integrator's
   guess, unconfirmed: text should be typed in the box on the image, as in Windows' Paint, which
   is a change to this Paint's design and not a patch of two lines.

## Done when

Each item is answered, and the work an answer starts has its own task.
