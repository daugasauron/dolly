# Rework the Agents at play page into a plain demo page

- STATUS: CLOSED
- PRIORITY: 90
- TAGS: site,demo

Owner goal: sites/daugasauron.com/agents/ becomes a simple demo page without the promotional introduction; each video gets one or two plain sentences. Replace the Dollyfile Studio recording (a Pong-like game) with one where the Studio agent builds a genuinely interesting game inside Dolly.

Done when: the page is short and factual, the new Studio video shows a real build inside the browser, and the site packages.

## Status (2026-10-01)

- The page is plain (`2acec28`): one or two sentences per video.
- The Claude relay was removed at the owner's request, so the new Studio
  recording needs another provider (OpenRouter or the Codex relay). The
  recording rig in `/home/daug/dev/dolly-archive/misc/recording-rig-20261001/`
  still starts `claude-relay.mjs` and must be switched first; its
  `braille-asteroids` prompt and `cut.sh` are reusable.

## Closed (2026-10-05, big-picture review)

The page is plain (`2acec28`). The one remaining item, a new Studio
recording, is part of `20261005-131651-demo-recordings`, which already names
this task as its source.
