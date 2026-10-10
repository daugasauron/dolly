# GIMP in the Wine image, through the x86-64 interpreter

- STATUS: OPEN
- PRIORITY: 120
- TAGS: wine,demo,gimp

Owner (2026-10-10): "In parallel, would it be possible to add gimp to the wine environment and
run it through the emulator?"

Answer given: not as the interpreter stands; nothing was built or tried.

Owner, after that answer: "Any old version of GIMP is fine, I just want it as a tribute to the
original "The rise and death of JavaScript" talk." (Gary Bernhardt's "The Birth and Death of
JavaScript", where GIMP runs compiled to asm.js.) Taken up as: an old GIMP compiled from source
against Winelib into the Wine image, as Paint and NetSurf are, not interpreted. Branch
`demo/gimp`, worktree `work/wine`.

- `x86emu` has integer instructions and SSE moves only, no guest threads, and bridges window
  procedures but few other callbacks (`demos/wine/README.md`, "x86emu"). GIMP's own code, GLib,
  GTK, cairo, pango, babl and GEGL would all be guest code: floating point throughout, worker
  threads from start-up, and callbacks of many kinds (timers, font enumeration, thread entry
  points, COM objects for drag and drop).
- GIMP runs every file format and filter as a plug-in process; `CreateProcess` fails here.
- Measured: about 85 million instructions a second in Chrome. GIMP's start-up was not measured;
  the estimate of ten billion instructions or more is the integrator's.

What could work instead, none of it started:

- An editor built from source to wasm64, as Paint and NetSurf are. GrafX2 and Tux Paint draw
  through SDL, which Dolly has (`demos/sdl2`), and need neither Wine nor GTK.
- GIMP from source against Winelib would need GLib, GTK and some forty libraries ported and its
  plug-ins made threads; no estimate is honest before GLib alone runs.
