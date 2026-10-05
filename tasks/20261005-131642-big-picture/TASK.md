# Big-picture review: is Dolly still on its original design and intent?

- STATUS: OPEN
- PRIORITY: 320
- TAGS: core,review,design

Owner (2026-10-05): "use fable to go review the 'big picture' to keep the
project on track in the original design and intent."

## Work

Judge the tree as it is against each statement of `AGENTS.md` (goal, thesis,
Zen, hard constraints, interface layers, runtime model, rules), `README.md`,
`host/README.md`, `docs/` and `abi/`. Measure where a claim needs a number:
trusted browser lines, kernel lines, outer imports, catalog shape, core versus
demo weight, time from an edit to a verified result. Read the three sandbox
audits (`~/Downloads/AUDIT-sandbox-painpoints.md`, `~/Downloads/AUDIT-session-latency.md`, `~/Downloads/AUDIT-browser-runtime.md`): they are an agent's view of the product from inside.

## Done when

- Findings are recorded here with file references: where the project drifted
  from its intent, what to delete, and the next core steps in order.
- Each actionable finding is its own task or a note on an existing one; open
  tasks that no longer serve the goal are closed with the reason.
- The owner gets one ranked list of at most ten items.
