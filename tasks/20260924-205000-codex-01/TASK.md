# Replace the hardcoded pilot mixer with an inspectable embedded program

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: game,input,programs

The starter car overrides individual wheel commands with a C WASD mixer while
piloting. The user wants an ordinary embedded program, generic across designs,
and reports inverted controls. Remove the wheel-specific C helper, expose pilot
input and blueprint bindings to controllers, and run the character's program
while piloting. Provide a visible program view and source export/import; retain
programs through design/world save and restore. Verify actual movement and turns
relative to the Eyes camera, individual wheel keys, and editable bindings in a
real browser. Preserve the autonomous population and controller budget limits.

The C wheel mixer and direct keyboard-to-magnet state writes are removed.
`driver.js` is an ordinary controller: it reads input/pressed keys, blueprint
bindings, wheel axes/positions and Eyes direction, then returns assigned actuator
strengths. No character name, ID or fixed wheel index is required. Quick key
taps are delivered through the same generic input interface. The Program panel
shows the actual workshop or followed character source and supports export and
workshop source import. Source remains part of existing design/world saves.

The physical pilot fixture passes with remapped H–O wheel bindings and with the
whole car rotated so its Eyes face +X and wheel axes run Z: forward 6.554/6.618 m,
right yaw negative, left positive. Individual wheel commands remain available;
an empty replacement program produces no movement or actuator commands despite
W/D/E input. Evidence: `build/slopyard-driver-edit/pilot-physics.log`.

`build/slopyard-driver-ui/` verifies the actual camera/keyboard path: 11.210 m
travel, physical magnetic pickup and release, zero browser errors. The repeated
import test found and fixed a leftover upload temporary file.
`build/slopyard-driver-edit3/` exports the displayed source, imports a W→I
edit, rejects invalid replacement source, restarts and exports the same program
from the actual driven character. W travel is 0.000000034 m; I travel is 4.573 m.
The saved character contains the edited source and measured controller memory.
The physical pilot and source-edit checks are part of
`test/slopyard-driver-browser.mjs`.

The packaged image also passes source import/edit/invalid-replacement/restart
and active-character export in Firefox (`build/slopyard-driver-edit-firefox2/`):
W travel 0.000000069 m, I travel 4.600 m, zero browser errors. The maintained
regression remaps the input through an ordinary wrapper program, without
matching implementation spelling. Controller budgets pass all 70000 finite,
1000 paused and five runaway cases with the expanded sensor interface.
