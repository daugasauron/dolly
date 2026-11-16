# Airtime's mouse look is not checked with a captured mouse

- STATUS: OPEN
- PRIORITY: 150
- TAGS: godot,0.1.8

## State (2026-11-16, the audit)

Not started. Airtime's one browser check is `airtime-godot -- --autopilot 25` in
`demos/godot/test/godot-gpu-browser.mjs:210-264`, which takes no pointer.

In 0.1.6, looking around in Airtime did nothing when the click that took the mouse was on the
crosshair: a HUD rectangle under the cursor took the captured mouse's motion (reported by the
Donna session, 2026-11-14). 0.1.7 sets every HUD control to ignore the mouse
(`demos/godot/airtime/hud.gd`, `ignore_mouse`); its release notes say the change is not yet
checked with a captured mouse. Voxel Flyover's test turns the view with real captured-pointer
input in both browsers (`demos/godot/test/godot-flyover-browser.mjs`): the same check fits
Airtime, with the click on the crosshair.

## Done when

A browser test takes the pointer with a click on the crosshair and measures the view turning in
Chrome and Firefox.
