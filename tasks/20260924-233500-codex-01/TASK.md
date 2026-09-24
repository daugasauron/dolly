# Add solid quarry terraces and preserve older maps

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: game,terrain,physics

Terrain version 3 adds a covered lower machine passage, a four-metre stepped
service road, layered rock shelves and an extraction pier. Keep the workshop
biped's measured walking corridor clear. Versions 0–2 retain their geometry
and restore without upgrading the map beneath saved bodies.

Chrome evidence: `build/blockwalker-ridge-view-chrome/`. Inside Dolly, real
body drops verify floors, gallery and pier; map imports verify old geometry
and rejection of future versions. An ordinary embedded wheel program drives
an unmodified cart up the road to y=4.698 m (minimum up 0.95357). The three
rendered views run at 58.99 FPS, near real time, without removals, program or
browser errors. The road test now lives with the map checks in
`test/fixtures/blockwalker-playground.c`.

The final fixture also recompiled and passed in Firefox; actual terrain
screenshots were inspected. `build/blockwalker-ridge-view-firefox/` records
47.75 FPS, near real-time simulation, zero removals or controller/browser
errors, and zero HTTP requests. The owned preview remains on image27 until
the combined content checkpoint is tested and packaged.
