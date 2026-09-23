# Expose all joint controls when manually testing larger characters

- STATUS: OPEN
- PRIORITY: 150
- TAGS: audit,game,ui,controls

Open Sidelight IV from the design library and Test character. It has 12 powered
hinges, but the manual control panel renders seven rows and only "+ 5 more
active joints" for the rest (`draw_ui` in `main.c`). There is no scroll/page path for
those rows. Five actuator pairs work at the physics level but their keybindings
and live angles are hidden during play. This makes learning the biped manually
needlessly difficult. Do not simplify its verified body/controller to hide this.

Verified screenshot: `build/blockwalker-audit-20260923/biped-manual-controls.png`;
the browser exported the selected 29-part, 12-actuator design. Allow inspection
of every actuator and binding while testing. Verify with this biped and a larger
saved design, keeping keyboard control and camera behavior intact.
