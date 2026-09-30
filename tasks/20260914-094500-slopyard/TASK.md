# Build a C character workshop with raylib, Box3D and GPU graphics

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: game,gpu

Work on a separate branch. Begin in a Lego-like block character editor with
powered joint blocks and assignable movement keys. Use the existing gamedev
Box3D library for fully 3D physics and raylib for the C application. Focus on
character creation, then drop the result into a plain test world. Walking and
balancing must come from the design and the player's controls, as in QWOP.
Include a four-joint starter and allow smaller/stranger designs. Prefer GPU
graphics; keep simulation in the sandbox.

Verify face placement, attachment editing, key remapping, export/import, undo,
real joint motors and floor collision, return to the original build, and actual
GPU rendering in a browser. Preserve the rest of the catalog and record evidence.

Implemented on `codex/slopyard-20260914`, based on main `e0dc968`.
See `controls and architecture`.

Verified 2026-09-14:

- Compiled the C application inside Dolly, reusing nine cached base images.
  Final image packaging took 8.9 seconds; no kernel rebuild was needed.
- `slopyard --check` passed with real Box3D motors, welded attachments,
  floor collision and blueprint save/load.
- `xvfb-run -a node test/slopyard-browser.mjs` passed in Chrome
  151.0.7922.71 on NVIDIA Blackwell: face placement, branch removal/undo,
  axis/speed/limit changes, duplicate-key rejection and remapping, download/
  upload, manual joint control, preserved build pose, exit and restart.
  The remapped joint received 96 driven physics steps and reached 1.054 radians.
  There were no page errors and no GPU readback.
- Five-second editor samples measured 42.78 FPS with five boxes and 42.15 FPS
  with 64 boxes. These measure the whole rendering loop, not isolated GPU time.
  Box3D remains CPU-only and non-SIMD; WebGPU renders the box world.
- Seven recipe tests passed; all 40 pinned image recipes linted successfully.
  Existing images remain in the catalog.

Local screenshots and detailed results: `build/slopyard-proof/`.
Image: 176,561,495 bytes, SHA-256
`0eaa79f185f6042c7b98f6039e3ce56d6baa117e787df6a9fd1847308e234e03`.
