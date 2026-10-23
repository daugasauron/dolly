# pi-local: Pi on a local model, smooth in use; the model is confused about the environment

- STATUS: OPEN
- PRIORITY: 180
- TAGS: pi,local-llm,agent-experience,0.1.4

Owner (2026-10-23): "make the pi agent with the local model (pi-local) smoother. Try to use
it and inspect the output to make it nice, now the model seems quite confused about the
environment."

`pi-local` (`demos/local-llm/Dollyfile-pi-local`) is `pi-agent` with local models
(`qwen3.5-2b`, `minicpm5-2b`) served in the page over `gpu@0` by
`demos/local-llm/local-model-provider.js`; it reads the same Dolly guidance as `pi-agent`
(`demos/pi/SYSTEM.md`, the `dolly` skill, `dolly-tools.js`), written for large models.

Done when: sessions of the kinds a person starts (ask what is here, read and edit a file,
run a command, build a small C program) are recorded before and after with each model, the
causes of the confusion are named from those transcripts, the fixes are in and measured
the same way, and `demos/local-llm/test/local-llm-browser.mjs` passes on the GPU in Chromium
and Firefox.
