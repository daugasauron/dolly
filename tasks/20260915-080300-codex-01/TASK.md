# Let Pi test complete feedback cycles in practice

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: game,agent,iteration

The 20-second programmed-trial limit hid failures in bipeds whose transfer and
landing cycles run longer. Sidelight VII stalled at 31 s; Sidelight IX looked
upright at 20 s but fell around 55–59 s in an independent replay.

C and the Pi tool now accept up to 90 simulation seconds (5400 fixed physics
ticks), retaining the existing maximum of three timed GPU images and paused
practice after completion. Manual keyboard trials keep their current limit.

The source-only guarded browser compiled the changed C inside Dolly and ran
unchanged 29-part Sidelight IX through all 5400 ticks in 89.978 wall seconds;
5401 ticks were rejected. It captured three GPU images. At 20 s up=0.99944,
at 40 s up=0.98974, then up dropped below 0.9 at 55.12 s and below zero at
58.73 s. Maximum joint separation was 0.0181 m. Displacement after the fall is
not walking. Evidence: `build/slopyard-long-trial/long-trial.json`, PNGs and
`build/slopyard-long-trial-check.log`. No slow permanent suite was added.

The live `slopyard-biped` session has the updated C binary and tool source.
Compilation took 3.297 s and existing native physics checks passed in 5.535 s;
complete history/world hashes stayed unchanged. See `slopyard-long-trial-update.log`
and `slopyard-walking/wakeup-updated-proof.json` under build.

The actual resumed Astra/xhigh Pi also called `program_trial` with 90 seconds,
completed it and reported the same Sidelight IX fall before testing Sidelight X.
Evidence: the 23:07 UTC native-history mirror and wakeup continuation proof.

Bundled with practice-memory inspection. The fresh packaged image accepted
5400 ticks and rejected 5401 in the guarded Sidelight XI replay; it completed
90 seconds in 90.016 wall seconds with three GPU captures. Evidence:
`build/slopyard-memory-trial.log` and `slopyard-memory-trial/proof.json`.
Only the app module rebuilt; cached dependencies were reused (20.4 s package).
