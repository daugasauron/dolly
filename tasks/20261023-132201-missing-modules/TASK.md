# amy names one missing host module at a time

- STATUS: OPEN
- PRIORITY: 140
- TAGS: amy,core,agent-experience,0.1.4

No description.

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
