# Avoid trapping recovery trucks between machinery and shore

- STATUS: CLOSED
- PRIORITY: 240
- TAGS: game,content,bug

Recovery93's short narrow escape fan trapped it between loader clearance and
shore. An opposing guard then legitimately lifted it; contacts peaked974.7N.
The user chose to keep captures and teammate rescues, so enemies/forces remain.

The program evaluates14/10/6m lookahead, lateral escape directions and swept
terrain/traffic clearance. Exact90.016667s pre-capture continuation with only
92/93 changed runs300s without truck tipping, crew contacts, errors or deaths.
All97 earlier actors/other programs remain;104 objects,7 deliveries, one East
handoff, both trucks upright. Evidence: `build/slopyard-compound-regressions-
chrome-warehouse-recovery-wide/salvage/`.

Fresh1500s combined run completes four East and two West recoveries, with no
recovery-truck tip or slinger-crew collision. This improves escape decisions;
it does not make vehicles immune to legitimate captures.

Packaged in image37. Chrome/Firefox match all98 catalog programs/blueprints
and restore old plus loaded worlds; see `docs/crash-handoff.md` for evidence.
