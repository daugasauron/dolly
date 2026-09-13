# Dolly issues

Project issues live in `tasks/<id>/TASK.md` using [tatr](https://github.com/tsoding/tatr).
The files are ordinary Markdown committed with the project; editing them requires no tool.
For the CLI, follow the upstream build instructions. Revision `49fc042` was used for this import.

```sh
tatr ls
tatr ls :audit and priority ge 200
tatr ls :bug
tatr summary
tatr new -p 200 -t bug,filesystem -s alice-01 "Describe the problem"
```

Higher priorities sort first. Rank reproduced bugs and measured iteration costs
ahead of file reorganization; use `tatr ls` for the current remaining work.
Use a unique suffix when creating multiple tasks in the same second.
Put reproduction steps, evidence, and completion criteria in the task body.
Set `STATUS: CLOSED` after verifying the fix and record the result or commit;
`tatr ls -c` lists closed issues. The current CLI has no `close` command.

The `audit` tasks come from the 2026-09-13 review of deployed main at `ff633f7`.
Each task distinguishes reproduced failures from architectural recommendations.
Local evidence paths refer to the original investigation checkout and may not exist in a fresh clone.

Follow-up findings and measurements are recorded with their implementation and
validation in the corresponding issues. Overnight work is on
`codex/core-iteration-20260913` in `work/core-iteration`; the original rts-arena
checkout and its tracker remain available at the repository root.
