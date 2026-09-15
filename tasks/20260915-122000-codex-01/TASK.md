# Save unreleased workshop experiments

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: game,agent,persistence

Opening another library design replaced the working XXXVI source. Native
history preserved it, but Pi could not reopen that unreleased experiment and
reconstructed a separate version. The direct save_design tool and library
Save current button now preserve exact blueprint/controller pairs without
spawning a creature, using the existing representation and duplicate detection.

Verified inside Dolly and real Chrome:
- Source-only C build 4.076 s; rejected a missing controller, reused duplicate
  IDs, preserved active practice/memory and continued a real motor trial.
- Manual save, ground/water selection and exact 50-object/three-design reload.
- Packaged integration/reopen suite passed; one added simulation tick exercises
  duplicate save, unchanged practice/world and unreleased design persistence.
- Actual Astra/xhigh Pi saved XL as library #45 before opening Sidelight II #44.
- Six exact older experiment sources are restored as #47-52. Current XLI is
  #46. All 53 live creatures' poses/velocities, source, memory, random state and
  age, every earlier library entry, and the current workshop stayed unchanged.
- The named-session export retains all 52 library entries and the full
  355431228-byte/1853-entry native history, including its verified 354579335-byte
  earlier prefix. Credential-free bipeds-state.tar contains the completed save.

Evidence: build/blockwalker-draft/proof.json,
build/blockwalker-biped-checkpoint-integration.log, and under
build/blockwalker-walking/: recovered-drafts-proof.json,
recovered-drafts-persisted-proof.json, bipeds-restore-proof.json.

A diagnostic helper's competing download handlers caused an unhandled ENOENT
and closed its browser before the first final save. Recovery used the intact
checkpoint, then saved before exporting proof with one explicit consumer.
The live helper must also allow minutes for full native Pi history loading;
a stale GPU frame count is not startup readiness. These helper fixes are in
build artifacts; no browser authority or filesystem API was added.
