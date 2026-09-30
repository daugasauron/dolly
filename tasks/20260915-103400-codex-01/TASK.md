# Let Pi observe late gait failures in longer practice trials

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: game,agent,iteration

The 90 s practice ceiling missed demonstrated late failures: Sidelight XXXI
passed five early steps, aborted its next world swing at 95.2 s and was removed
at 172.0 s. The C entry and actual Pi tool now accept up to 300 simulation
seconds, retaining three timed GPU images, cancellation, resource limits,
fresh controller memory and paused physics afterward. No physics tuning changed.

The guarded browser compiled C inside Dolly and passed existing native checks.
A full trial completed 18000 ticks in 300.083 wall seconds, rejected 18001 and
remained paused across another 50 frames/one second. The unchanged original
XXVIII made 16 alternating physical foot placements and travelled 5.48660 m;
minimum up=0.973662, maximum stance slip=0.154157 m and joint separation below
0.007587 m. Rotated box-corner poses independently verified clearance and
advance. Evidence: `build/slopyard-endurance/` and its runner/check/analysis.

Actual Astra/xhigh Pi advertised the longer schema and completed a 300 s tool
call with all 18000 ticks, exactly three GPU images and readable memory;
`build/slopyard-endurance/pi-tool-proof.json`. The in-place app update took
3.324 s to compile and 5.587 s for native checks, preserving all workspace files.
No slow permanent suite was added for this bound change.

The app image rebuilt in 20.6 s: 231885797 bytes, SHA prefix f0e30fcc811a7b33.
A fresh browser checked the actual bound and byte-identical executable;
`build/slopyard-late-fall/package-proof.json`. Kernel hash was unchanged.
Complete import into new session `slopyard-endurance` preserved all five
selected files, in-Dolly world/history hashes and actual session compatibility.
The 02:34 UTC continuation check passed: advancing world, all 53 IDs/sources/
blueprints, 1390 parts, ten unchanged removals and the entire 341,646,263-byte
native history prefix in the growing 342,396,532-byte file. Real Astra/xhigh
requests resumed. Evidence: `build/slopyard-walking/endurance-image-` files
`restored-proof.json`, `updated-proof.json` and `continuation-proof.json`.
