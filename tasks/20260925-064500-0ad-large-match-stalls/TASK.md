# Reduce simulation stalls in developed 0 A.D. matches

- STATUS: OPEN
- PRIORITY: 80
- TAGS: performance,wasm64,0ad

Follow-up to the [gameplay audit](../20260924-115634-0ad-gameplay-performance/TASK.md),
checkpoint implementation `532a3c0` on `codex/0ad-baseline-20260923`.
The rendering/selection fixes are verified, but developed matches still hitch.

Reproduce from the `zero-ad` image's shell with this ordinary upstream setup:

```sh
zero-ad -autostart=random/mainland -autostart-size=256 -autostart-players=4 -autostart-biome=generic/temperate -autostart-seed=11 -autostart-ceasefire=40 -autostart-visibility=revealed -autostart-civ=1:athen -autostart-civ=2:brit -autostart-civ=3:rome -autostart-civ=4:maur -autostart-ai=1:petra -autostart-ai=2:petra -autostart-ai=3:petra -autostart-ai=4:petra -autostart-aidiff=1:3 -autostart-aidiff=2:3 -autostart-aidiff=3:3 -autostart-aidiff=4:3
```

Run for thirty wall-clock minutes, box-select every fifteen seconds and move
the camera among developed areas every minute. The local diagnostic harness is
`.cache/0ad/large-economies-soak.mjs`; it runs Chrome on the Radeon ICD with two
CPU cores and a 6 GiB, no-swap systemd scope. Do not run concurrent GPU audits.
Its native fixture only adds profiler export to the production renderer.

Measured evidence in `.cache/0ad/large-state-amd-chromium*`:

- 132,654 intervals, mean 13.58 ms, maximum 868.06 ms, 8,837 above 33.34 ms.
  Some thirty-second camera views average 27–29 ms.
- Populations 295/286/262/248, all active, after 1,576.6 simulation seconds.
  The complete run and visible-view check pass with zero engine warnings/errors.
- A retained 577.52 ms native frame spends 530.48 ms in simulation, including
  497.65 ms in Petra and 151.70 ms in its building-construction path.
  Other samples contain 118–122 ms simulation updates and 24 ms rendering
  submissions. `.cache/0ad/large-state-profile-summary.txt` has nested scopes.
- The 868 ms maximum is outside the retained native buffer. The first 322.65 ms
  stall adds 2.49 ms provider batch time; it is not evidence of a long GPU fence.
- Peak cgroup memory is 6,207,926,272 bytes, including server/browser file cache;
  the mid-run sample attributes about 2.0 GB to file cache. This is not a minimum
  RAM requirement. The saved memory-event sample reports no limit hits or OOMs.

Profile Petra headquarters/placement searches and simulation updates more finely
on this workload before changing behavior. Preserve upstream simulation, RNG,
save/load and replay identity; do not mask pauses by changing AI difficulty or
simulation speed. Prefer general runtime or upstream improvements over a Dolly
AI fork. Validate reductions with comparable developed states and camera views,
both browsers, frame tails and simulation progress, plus the existing replay,
save/load and input checks. A small paused rendering benchmark cannot close this
issue.
