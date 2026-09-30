# Include the learned playground in a fresh game

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: game,distribution

The live Pi browser contains a varied moving world, but a fresh image currently
starts with an empty world. Instantiate the bundled learned designs only when
no saved world exists, including a loose crate for the magnetic crane. Keep the
initial character builder, and preserve existing saves without adding duplicate
creatures or resurrecting removed ones. The saved controllers must run without
model access; Pi remains optional for further experiments.

Verify a fresh browser has moving land, air and water creations and a functioning
cargo crane. Check save/restart preserves identities without duplication and an
explicitly empty saved world remains empty. Compile C inside Dolly and run the
focused browser checks under the existing 4 GiB/no-swap guard.

## Verification, 2026-09-15 02:41 JST

First launch now instantiates the bundled designs, including the saved Skybarge
and a loose crate at Dockhand's pickup point. The builder remains the first view;
World opens the populated playground. Any existing world file suppresses this
initial population, including an explicitly empty save. No model call is needed
to run the controllers. Bodies and source are reused from the design library.

The image compiled inside Dolly and both focused Chrome suites passed under
separate 4 GiB/no-swap scopes. Six world exports over 18.65 simulation seconds
retained all 15 objects with zero removals. Dockhand lifted its crate to 2.194 m,
carried it and released it 2.839 m from pickup. The catamaran travelled 5.826 m;
Skybarge was at y=6.178 m, up=0.999. Existing-empty-world and subsequent
seven-creature save/restart checks passed without adding starter duplicates.
Editor, library, camera, keyboard, magnet and material checks also passed.

Evidence: `build/slopyard-starter-world-integration.log`,
`build/slopyard-starter-world-editor.log`,
`build/slopyard-proof/fresh-world-0.json` through `fresh-world-5.json`, and
`build/slopyard-proof/fresh-harbor.png`.
