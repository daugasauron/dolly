# A turn of pi-local's bundled model in Firefox did not end

- STATUS: CLOSED
- PRIORITY: 120
- TAGS: local-llm,pi-local,flaky

In the v0.1.5 candidate round's GPU stage (2026-11-05 15:51,
`work/integrate/build/round-1105rc-evidence/gpu-local-llm.log`), `local-llm-browser.mjs`
passed pi-local in Chromium and, in Firefox, bundled inference, session restore and fresh
boot, then typed its first task in Pi ("Create /workspace/first.txt containing the word
dolly ..."). Pi showed Working until the stage's 2400 s timeout. The rerun at 16:36 passed
both images in both browsers in 951 s (`gpu-local-llm-2.log`); the morning's round passed in
16 minutes.

Each reply is limited to 2048 tokens (`demos/local-llm/models/*.json`), so a turn that does
not end is many replies: tool calls repeated, or a reply the provider never ends. Nothing on
the screen was kept: the test's wait for the turn had no limit of its own. It now fails
after 10 minutes with the visible text, which is what to read next time.

Done when the cause is named from that text or a reproduction, and fixed where it lies.

## Closed (2026-11-16, the audit): not seen again

There has been no reproduction in eleven days. The GPU stage of four later rounds ran
`local-llm-browser.mjs` in Firefox: `round-1113c`, `round-1114`, `round-1115` and `round-1117`
(`work/round1113/build/*-evidence/gpu-local-llm.log`). Each time, Pi's two tasks in pi-local
passed ("pi-local firefox task with qwen3.5-2b, minicpm5-2b installed … passed with external
requests denied"), with no failure line. If a turn hangs again, the test's 10-minute limit prints
the screen, which is what this task lacked. Reopen from that output.

## 2026-11-21: a turn cut short, not one that hung

Round 018q's GPU stage (`work/evidence-2026-11-21/round-018q-gpu.log`) failed in
Chromium on `first.txt`: each of the three asks shared one conversation, the model's replies
ran to their 2048-token limit, and with about 12,000 of the 16,384 tokens filled Pi clamps a
reply to the context less 4096 (`clampMaxTokensToContext`), so its compact-and-retry failed
and the third ask ended before the test saw Working. A retry now starts with `/new`.
