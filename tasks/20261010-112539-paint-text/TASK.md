# Paint's text tool does not write

- STATUS: OPEN
- PRIORITY: 80
- TAGS: bug,wine,demo

Owner (2026-10-10), on v0.1.1's `wine` image: "the text area write doesn't
work in paint."

Not reproduced by the integrator yet. To do first: in Paint (Start menu),
choose the text tool (the "A" in the toolbox), drag a text box on the
canvas and type; record what happens (no box, a box that takes no keys, or
text that is not drawn into the image), in Chromium and Firefox.

Likely places, unverified: ReactOS Paint's text tool opens an edit control
over the canvas and a font toolbar window; this build runs programs as
threads of one process and carries a reduced set of Wine DLLs
(`demos/wine/README.md`), so a missing window class, focus between the
canvas and the edit control, or a font call are candidates.

Done when a browser check in `demos/wine/test/wine-browser.mjs` types into
the text tool and reads the drawn pixels.
