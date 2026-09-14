# Follow moving creations and expand the world viewport

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: game,camera,ui

Clicking a world creature should follow its physical motion while preserving
the user's orbit and zoom. Manual camera movement, Home and place shortcuts
should release following. Use stable creature identities and stop following
cleanly when the creature is removed.

Add a focus view with Shift+Tab and a visible toggle. Expand rendering and
mouse picking to the available screen; keep Pi independently toggleable with
Tab. Hidden menus must not intercept clicks. Escape should restore controls
before leaving the current game mode. Keep explicit GPU observations correctly
cropped and sized when the viewport changes, without ordinary frame readback.

Verify real browser camera/body displacement, free travel, focus/Pi toggles,
prompt input, full-view block placement, capture dimensions and existing editor
and physics behavior. Preserve the live world and complete Pi conversation.

## Verification, 2026-09-15 04:00 JST

Compiled the C image inside Dolly. The focused browser check followed a real
rover for 84 frames/4.72 m with zero measured camera/body offset drift, including
orbiting and typing into Pi. WASD released following. A real controller exception
removed a second followed body; its stable identity was cleared and the camera
remained at its last location. Hidden menu clicks did not select another target.

The test switched repeatedly among the normal 756x594 viewport, 1280x720 focus
view and 998x720 view beside Pi. Nine real GPU observations had the correct
640-pixel width and aspect ratio after capture-buffer reuse. Full-view block
placement matched the ray calculated from actual C camera coordinates. Shift+Tab
worked while the prompt had focus; Escape restored controls before changing mode.
No model requests occurred. Full-screen world, Pi and builder images were checked.

The existing editor and physics/browser suites also passed under separate
4 GiB/no-swap scopes. Ordinary editor rendering still read back zero GPU bytes;
native camera, under-floor placement, library programs, cargo, water, feedback
flight and saved-world checks passed. The live Pi world was untouched during
verification. No browser authority or GPU ABI changes were needed.

Evidence: `build/blockwalker-focus-build.log`, `build/blockwalker-focus-browser.log`,
`build/blockwalker-focus-editor.log`, `build/blockwalker-focus-integration.log`
and `build/blockwalker-focus/`. All three test browsers exited.
