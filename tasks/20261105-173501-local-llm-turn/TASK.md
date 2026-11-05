# A turn of pi-local's bundled model in Firefox did not end

- STATUS: OPEN
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
