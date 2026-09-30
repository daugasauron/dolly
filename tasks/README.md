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

The `audit` tasks tagged before 2026-09-30 come from the 2026-09-13 review of deployed
main at `ff633f7`. Tasks `20260930-100000-audit-*` come from the 2026-09-30 takeover
audit of main `4340d03`; each records whether a finding was reproduced in a browser,
confirmed by reading, or suspected. Local evidence paths may not exist in a fresh clone.
