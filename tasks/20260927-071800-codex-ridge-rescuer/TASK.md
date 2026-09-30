# Build a ridge rescuer that can release a captured aircraft reliably

- STATUS: OPEN
- PRIORITY: 40
- TAGS: game,controllers,physics

The overnight Kamoshika prototype is withheld from the default catalog. The
22-part version frees an aircraft in `ridge-window-focused`, but full traffic
exposes failed approaches and falls. The36-part counterweighted version climbs
the quarry and stays upright; it has not completed the difficult grounded rescue.
Do not present climbing, magnetic contact or a rescue counter as a successful
release without following both bodies afterwards.

Reproduction: `build/living-world-20260926/ridge-first-grip/before.lua` contains
the real1200s populated state. Aircraft31 is held by interceptor82 near
(84.27,13.55,-41.73); rover83 is near(93.26,12.69,-40.38). The candidate uses six
wheels, two parallel100N rams, six100N downward magnets in a3×2 head, and raised
rear ballast/wheel arches. Blueprint: `ridge-wide-grip-design.lua`; controller:
`ridge-final.lua` in the same evidence root. All enemy controls/forces are unchanged.

The300s replay grips the aircraft at1201.100s and loses its grip at1211.050s.
The opposing grip never releases. Rover minimum up0.917; aircraft ends up0.351,
still held. An earlier version releases the aircraft but overturns on retreat
(`ridge-wide-arrival`); its mechanical success does not make it a stable design.
The fresh two-hour run has no rover grips/rescues; it returns to its service bay
when the initial airborne capture ends before it arrives.

Complete after a generic visible Lua program climbs from the lower service bay,
releases the actually captured aircraft, lets it resume flight and leaves the
rover upright and able to return. Exercise the difficult state above plus a
fresh populated run,20Hz control, save/reload and normal rendering. Keep forces,
contacts and outcomes physical; no actor-ID rules, moved bodies or weakened captor.
