# Start the workshop with Starter Car

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: game,ui

Remove workshop starting-choice buttons and their click handlers. Keep the
existing fresh-session Starter Car and Design Library entry point.

Verified the rebuilt local 9097 image in Firefox using Playwright:
`build/workshop-start-20260927/proof.json`. The car has its four wheels,
steering, Eyes, magnet and embedded driver. Former button regions no longer
change the design; the library opens another blueprint and its program, which
survive restarting the game. No browser errors. Package checks preserve the
other images and saved files. Updated the existing browser test's obsolete
preset-button actions; the full historical suite was not rerun.
