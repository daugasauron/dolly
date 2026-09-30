# Make the Pi trace panel readable during play

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: game,ui

The real Pi panel split words at a fixed 29-byte boundary and left usable width
empty. The C renderer now wraps by measured font width and word boundaries,
keeps UTF-8 characters together and uses 15 px text. Long identifiers still wrap.

Fresh and settled consecutive real-browser launches render paragraphs and long
messages correctly, and both prompt messages arrive intact. A very early image
during one consecutive launch had a transient layout discrepancy; it did not
reproduce after startup settled. Direct C row inspection retained paragraph
breaks. Evidence: build/slopyard-trace-{wrap,alone,reload,debug}/. Source-only
compilation took about 4.1 s. The image and updated integration/reopen suite passed. In-Dolly source hashes
match the package, and the resumed real Pi panel renders the larger word-wrapped
traces (build/slopyard-walking/bipeds-running.png).

A synthetic per-frame log flood took median 72-78 ms per whole game frame with
50 background objects. Instrumentation measured about 22 ms per complete UI
draw and 0.79 ms of wrapping; this is not normal quiet-scene FPS. The existing
full software UI redraw dominates wrapping cost. No performance gain is claimed
and no new permanent timing suite was added.
