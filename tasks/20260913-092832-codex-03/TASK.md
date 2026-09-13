# Stop shell lists and pipelines after Ctrl+C

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: audit,bug,core,lifecycle

## Evidence

On `ff633f7`, interrupt either command during sleep:

```sh
sleep 30; echo wrongly-ran > /tmp/after-list
sleep 30 | /bin/slop -c 'echo wrongly-ran > /tmp/after-pipeline'
```

Chrome created both marker files and returned status 0. Firefox reproduced the list case.
The earlier handoff also records the compound form `(sleep 30) | ...`.
An ordinary `/bin/slop -c 'exit 130'; echo continues` was tested as a control and must keep its normal exit behavior.

[`dolly_wait`](../../src/process/runtime-adapter.c) discards signal metadata already provided by the kernel.
Propagate actual signal termination through [Slop](../../src/slop.c) lists, pipelines, and nested shells.

Earlier local evidence, when available: `build/pipeline-interrupt-probe.mjs`,
`build/pipeline-interrupt-browser-red.log`, and `build/pipeline-interrupt-{compound,list}-browser-red.log`.

## Done when

- Ctrl+C stops the remaining interrupted list/pipeline, including compound and nested forms.
- Ordinary exit status 130 remains distinguishable from signal termination.
- Descriptors and children are cleaned up and the interactive prompt remains usable.
- These behaviors are verified in Chrome and Firefox.

## Resolution

Slop now uses the kernel-provided wait status to distinguish signals from an
ordinary exit code. SIGINT/SIGQUIT stop the current list through pipelines,
compound commands, functions, substitution and nested shell processes. The
interactive shell returns to its prompt. Cwd snapshots retain directory handles
so renamed directories restore correctly.

Chrome and Firefox compiled the new shell inside Dolly and passed eleven signal
cases, the ordinary exit-130 control, and directory renames in subshells and
substitutions. Both browsers also ran three real Ctrl+C keypress cases in a
custom interactive image and verified prompt recovery and absent marker files.
All 78 native sanitizer checks pass. These regressions are in the core gate;
packaging the new shell into the standard seed/default is part of the final build.
