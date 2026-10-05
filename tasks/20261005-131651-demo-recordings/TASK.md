# Regenerate the demo recordings with a stronger model over OpenRouter

- STATUS: OPEN
- PRIORITY: 250
- TAGS: demo,site,openrouter

Owner (2026-10-05): "Use the openrouter API key in ~/.openrouter to regenerate
some demos, the current ones are nice regarding format but the results in the
videos are very underwhelming."

## Work

Find how the current recordings were made (`demos/game-agent`, the site's demo
page, `20260930-220200-demo-page`). Keep the format. The owner chose the model
(2026-10-05): `stealth/space-bunny-alpha` on OpenRouter, currently free. Choose
tasks whose result is visibly good on screen, record against the
local release candidate, and replace the recordings. Record the model, prompt,
selection rule and cost of each here.

The key is read from `~/.openrouter` at run time. It is never printed, logged,
committed, or sent anywhere but openrouter.ai. If the model stops being free, stop and report before spending.

## Done when

- The local release candidate's demo page shows the new recordings.
- Costs and the before and after are recorded here.
