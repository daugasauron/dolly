# Stop shell lists and pipelines after Ctrl+C

- STATUS: OPEN
- PRIORITY: 300
- TAGS: audit,bug,core,lifecycle

No description.

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
