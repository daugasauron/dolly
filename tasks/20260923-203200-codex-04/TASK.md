# Allow replacing an imported Pi proxy configuration

- STATUS: OPEN
- PRIORITY: 200
- TAGS: audit,game,agent,ui

At aa28100 Pi → Import proxy config uploads directly to the final
`/workspace/blockwalker-agent/models.json` path (the `click` handler). Dolly's uploader
rejects existing paths with EEXIST before opening the picker (`upload.c:59`).
After one successful import, every subsequent attempt immediately reports
"Proxy import cancelled", although the user did not cancel anything.

Reproduced in a fresh browser with a credential-free `{"providers":{}}` file;
Pi stayed paused and no model requests were made. The first import succeeded;
the second displayed no file picker and showed the misleading cancellation text.
Evidence: `build/blockwalker-audit-20260923/proxy-{first,second}-import.png` and
`build/blockwalker-audit-ui.mjs` (91843 exit 0).

Import to a temporary path, validate and replace only after success. Retain the
old configuration on cancellation/invalid input. Apply an updated configuration
to the next connection, including an already-created agent session, and report
actual errors. Verify two imports and cancellation without a live model call.
