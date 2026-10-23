# amy names one missing host module at a time

- STATUS: CLOSED
- PRIORITY: 140
- TAGS: amy,core,agent-experience,0.1.4

## Closed (2026-10-24, `core/terminal`, `9486fbb0`)

One refusal names every module the package needs and the image lacks, with the one step
that adds them all, in the two forms the engine had:

```
dollyfile: /v0.1.4/Dollyfile-listens needs microphone@0 and gpu@0: nena enable microphone gpu
dollyfile: /v0.1.4/Dollyfile-listens needs microphone@0 and gpu@0: add REQUIRES HOST microphone@0 and REQUIRES HOST gpu@0
```

- `src/dollyfile.c` `read_artifact_receipt` collects the missing modules over the receipt's
  host records and refuses once after them, status 2 as before; nothing is installed.
- `test/amy-browser.mjs`: the `listens` fixture needs `microphone@0` and `gpu@0`; "amy"
  checks the first line in `default` (it has `nena@0`), "amy refusal" the second in `system`.
- Measured with the same two checks as a scratch test: on the old engine both browsers
  printed only `needs microphone@0: nena enable microphone` (fail); on the new seed
  (image inputs `b871765b`) both pass in Chromium and Firefox.
  The "amy" and "amy refusal" tests themselves pass in both browsers, without their python
  and per-package steps, which need catalog images not built for this seed.

Found by Opus 5.5 in Pi (`tasks/20261023-180000-opus-in-pi`, round 3, `r3-python/`): asked
for a small Python script in pi-agent, which declares `nena@0` but neither `dso@0` nor
`sockets@0`, it needed two refusals to learn that python needs both.

Reproduction, in pi-agent (or any image with `nena@0` and amy, without `dso@0` and `sockets@0`):

```sh
amy install python    # dollyfile: .../Dollyfile-python needs dso@0: nena enable dso
nena enable dso
amy install python    # dollyfile: .../Dollyfile-python needs sockets@0: nena enable sockets
```

Cause: `src/dollyfile.c` (around line 1110) stops at the first host requirement the image
neither declares nor has enabled. Expected: one refusal naming every missing module, as
`needs dso@0 and sockets@0: nena enable dso sockets` (and the `add REQUIRES HOST` form
alike). It is the seed; not fixed on the opus branch, by the brief.

Done when: the refusal names every missing module, with a case that fails on the old engine.
