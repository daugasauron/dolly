# Prevent the salvage boat hook from jamming against its boom

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: game,content,bug

The boat rolled at557.2s while unfolding its boom. Braking alone did not fix it:
boom126/hook127 contacts reached700..2000N before rollover and6000N afterward.
The fully retracted1m cable lacked corner clearance. No collision exemption was
added. The controller leaves1.8m out, brakes before slewing, limits slew speed,
then aims the boom before selecting the pickup approach. Only static shore
obstructions reject a pickup; moving traffic is avoided and progress resets
the stall timeout.

Exact550→1050s mechanical replay: continuous minimumup.984748 and zero sampled
boom/hook contacts after payout. Exact550→1450s navigation replay:3 pickups,
3 supported shore handoffs and real94→93→88→87→shot chains for cargo89/91.
All107 original actors/other programs/designs remain; no errors/deaths or crew
contacts. Trucks can be captured in this replay; that is explicitly permitted.
Evidence: `build/slopyard-compound-regressions-chrome-{boat-clearance,
boat-approach}/salvage/`, boat-proof.json and salvage-proof.json.

Fresh1500s combined run:2 pickups/2 handoffs, minimumup.988549, both recovered
parcels actually reloaded and fired, no crew contacts/errors/deaths. Loaded
boat91 remains attached across the packaged Chrome and Firefox restoration.

Packaged in image37. Chrome/Firefox match all98 catalog programs/blueprints
and restore old plus loaded worlds; see `docs/crash-handoff.md` for evidence.
