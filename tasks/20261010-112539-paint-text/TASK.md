# Paint's text tool does not write

- STATUS: CLOSED
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

## Reproduced and fixed (2026-10-10, branch `demo/netsurf`)

Reproduced on the v0.1.1-based image in headless Chrome: the text tool ("A") opens Paint's text
window (an untitled window with an edit control) and draws the dashed box dragged on the canvas, and
then nothing typed appears anywhere. Typing after a click inside that window's edit control did
write, into the edit control and into the box. So no window class or font was missing: ReactOS
Paint 0.3.17 takes the text in that separate window and never gives its edit control the keyboard
focus; activating the window by its caption leaves the focus on the frame.

Fix, in `demos/wine/mspaint-dolly.patch` (two lines of ReactOS's source, applied by
`prepare-mspaint.sh`): when the text box has been drawn, and whenever the text window gets the
focus, the focus goes to its edit control.

Evidence: `demos/wine/test/wine-browser.mjs` selects the tool, drags a box clear of the pencil
line and types "Dolly writes" without clicking anywhere; it waits for dark pixels inside the box
(157 in Firefox, 166 in Chromium; none before typing). `build/wine-evidence/paint.png`.
