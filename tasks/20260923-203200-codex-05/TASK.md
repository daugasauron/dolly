# Expose all joint controls when manually testing larger characters

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: audit,game,ui,controls

Open Sidelight IV from the design library and Test character. It has 12 powered
hinges, but the manual control panel renders seven rows and only "+ 5 more
active joints" for the rest (`draw_ui` in `main.c`). There is no scroll/page path for
those rows. Five actuator pairs work at the physics level but their keybindings
and live angles are hidden during play. This makes learning the biped manually
needlessly difficult. Do not simplify its verified body/controller to hide this.

Verified screenshot: `build/slopyard-audit-20260923/biped-manual-controls.png`;
the browser exported the selected 29-part, 12-actuator design. Allow inspection
of every actuator and binding while testing. Verify with this biped and a larger
saved design, keeping keyboard control and camera behavior intact.

Fixed with paged actuator controls. Bounded Chrome checks verified both the
12-actuator Sidelight biped and the 46-part, 13-actuator Landfreighter: the last
page exposes their remaining bindings/angles and highlights the final key while
it actually drives the mechanism. Existing camera and editor checks also pass.
Evidence: `build/slopyard-retro-editor.log`, `build/slopyard-retro-preview.log`,
`build/slopyard-proof/biped-controls-page-2.png` and
`build/slopyard-retro-proof/landfreighter-controls-page-2.png`.
