# Deep hedger: reconcile the earlier attempts into THEORY.md

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: dh,demo

Owner (2026-11-16): "There are SEVERAL (many !!) attempts at this project on this PC. [...] I want
you to use a Fable5.2 agent overnight that reconciles everything, focusing on my many many user
inputs during the different projects [...] The fundamental thing is to get the assumptions and
theory right. [...] Some of the projects ran on older dumber agents, so don't take anything they
state as facts."

## Closed 2026-11-17

`demos/deep-hedger/THEORY.md`: the problem, 23 decisions each with the owner's words and their
project and date, the assumptions, the theory, six open conflicts, what the evidence shows, and
what the demo implements of it.

How it was made, so it can be made again:

- The owner's messages were extracted from `~/.claude/history.jsonl`, the Claude Code transcripts
  under `~/.claude/projects/`, the Pi sessions of `boom`, `braut` and `dh`, and the Codex sessions
  whose working directory is one of the projects: 2,193 messages, 15 February to 26 October 2026,
  per project and in one file (`work/dh-evidence/extract.py`, `owner-words/`; not in git, they are
  the owner's private material). `~/dev/neil/sources/user_messages_all.md` is the same extraction
  made on 2026-10-23 without the transcripts.
- Read in full: `neil`, `mano`, `braut`, `sig-mmd`, `fable-2`, `codex-2`, `dh`; of `cher`,
  `cher-sim`, `fable` and `boom` every message of 200 characters or more that names the model
  (`filter.py`), 160 of them. The shorter ones are interface requests and status questions.
- Every quotation in THEORY.md is checked against the extraction (`check-quotes.py`): all found.
  The owner's spelling is kept.

Findings that differ from what the earlier documents say:

- `~/dev/neil/THESIS.md` 4.3 says the uncentered loss `mean((Y - W)^2)` makes the hedger
  cost-aware. On the long book the mean residual is `-(E[Y] - cost)`, so that loss rewards cost
  there. A squared error has no exchange rate between cost and risk; one parameter is needed
  (THEORY.md section 4). The owner said as much on 2026-10-23.
- THESIS.md presents the funding price, the fair-game constraint and "residual-based spreads were
  the wrong turn" as settled. They are that agent's proposals; the owner's last words on the
  spread are in THEORY.md conflict 1.
- The thesis conflict `mano` flags (historical returns) is decided by the owner's latest word,
  2026-09-07: none. `braut/mojo` still reads them (`gpu_generator.mojo:104-139`).
- No project addressed American exercise (conflict 6).
