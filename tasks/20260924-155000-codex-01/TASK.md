# Show the actual controls when piloting custom characters

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: bug,game,ui

World driving hints and the entry message always advertise WASD and E/Q.
WASD controls X-axis wheels, but other actuators use their assigned bindings;
a custom magnet can therefore use M/N while the UI still says E/Q. A flying
character or walker also should not be presented as a car.

Reproduce in a disposable browser with the starter car's magnet rebound to
M/N, enter the world, and compare actual pickup/release with the displayed
help. Prepared design: `build/slopyard-custom-magnet.character`.
Derive concise help from the current character, keeping the default car's
controls clear. Verify real custom-key pickup/release and inspect the normal
and focus HUDs. Do not add prose/spelling assertions.

The hints now derive wheel/joint control mode and magnet bindings from the
player's character. Distinct magnet bindings use the assigned-key hint.
A real M/N-bound car drove 10.506 m, picked up cargo with M and released it
with N; 87 sampled Eyes poses tracked the physical block. Normal and focus
HUD screenshots show M/N, and no browser errors occurred. Evidence:
`build/slopyard-custom-driver-bindings/{driver-proof.json,eyes-cargo.png,custom-focus.png}`.
The packaged image retains the verified C implementation.

Verified in packaged source `c092744`; the
[checkpoint](../20260923-213000-codex-01/TASK.md) records served-browser evidence.
