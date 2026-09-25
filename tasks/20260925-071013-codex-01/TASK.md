# Unblock the next warehouse pickup after chassis recovery

- STATUS: OPEN
- PRIORITY: 250
- TAGS: game,content,bug


After the chassis recovery, pallet 95 is correctly stored, but warehouse 77
repeatedly alternates route_pick and unstick while approaching the next pallet
104 (roughly 1387..1500 s). Root remains near (155.42,4.70,33.14), aiming for
(155.97,35.46). Cargo 104 is delivered/unheld at (150.556,5.485,30.712).
Exact world and trace: `build/blockwalker-compound-regressions-chrome-salvage-
warehouse-shed/salvage/`. The final catalog includes the successful chassis
recovery; do not undo that fix or move/delete cargo to free the route.

Inspect actual contact and wheel/floor observations. The warehouse's terrain
clearance currently uses wheel width, while its front magnet extends farther;
check whether this planned approach allows a protruding part to hit machinery.
That is a hypothesis, not a measured cause. Replay the saved population with
only the generic warehouse program changed, preserve all objects/other programs,
and prove subsequent storage with no controller errors or lost crew. Then
inspect both teams and update the packaged checkpoint if the fix is verified.
