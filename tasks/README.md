# Dolly issues

Project issues live in `tasks/<id>/TASK.md` using [tatr](https://github.com/tsoding/tatr).
The files are ordinary Markdown committed with the project; editing them requires no tool.
For the CLI, follow the upstream build instructions. Revision `9b0d752` is installed (upstream's newest on 2026-10-12).

```sh
tatr ls
tatr ls :core and priority ge 150
tatr ls :bug
tatr summary
tatr new -p 200 -t bug,filesystem -s alice-01 "Describe the problem"
```

An open task is something still to do. After its properties it has a dated "State" section
that says what is done and exactly what is left; when that changes, rewrite the section instead
of appending another. Reproduction steps, evidence and the done-when go in the body.

Higher priorities sort first. Rank reproduced bugs and measured iteration costs ahead of file
reorganization; a task that waits for the owner says so in its State and ranks low.

Close with `- STATUS: CLOSED` after verifying the done-when, in a closing section with the date
and the evidence (commit, release tag, test). A part that is not done and still wanted moves to
the task where it belongs first. The CLI has no `close` command; `tatr ls -c` lists closed
tasks, `tatr ref ID` what refers to one. Closed tasks are history and are not rewritten.

Use a unique suffix (`-s`) when creating several tasks in the same second. `tasks/tags`
describes every tag in use, one per line. The `audit` tag marks findings of the audits of
2026-09-13 (main `ff633f7`) and 2026-09-30 (main `4340d03`). Evidence paths under `build/`,
`.cache/` and `work/` exist only on the machine that produced them. Four closed tasks of
September have ids without a time of day, so `tatr` does not list them.
