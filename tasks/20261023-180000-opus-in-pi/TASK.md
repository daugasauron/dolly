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
