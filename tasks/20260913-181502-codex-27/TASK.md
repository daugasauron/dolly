# Measure independent Studio task correctness beyond successful builds

- STATUS: OPEN
- PRIORITY: 50
- TAGS: audit,local-model,testing

## Evidence

Historical real-model probes from 2026-09-10 produced invalid Dollyfiles or
incorrect programs despite successful tool calls and compilation. The retained
`/home/daug/dev/dolly/build/studio-pi-edit-sampling-correctness-final.log` ends
with source-built `linecount` returning 0 for `printf 'one\ntwo\n' | linecount`;
the explicit expected-output check fails. The traces are under the original
checkout's `build/studio-manual-evidence/studio-pi-edit-{default,sampling,repair}.jsonl`.
Those local files are preserved and are not required by a fresh clone.

This has not been reproduced on the overnight branch. Guided browser integration
checks use scripted responses and establish TUI/tool/transport behavior, not
independent model correctness. The historical log is an unresolved measurement,
not proof of a current Janis, compiler or model-adapter defect.

## Done when

- Re-run bounded independent author/build/debug tasks on a recorded model/configuration and current source revision.
- Judge generated programs against actual input/output behavior, separately from successful compilation or tool invocation.
- Record failures and determine whether they belong to Dolly's runtime/template/tool integration or model capability before changing code.
- Keep hardware/model evaluation optional; it must not slow the ordinary source/core browser gate.
