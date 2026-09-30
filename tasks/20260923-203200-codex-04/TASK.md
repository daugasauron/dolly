# Allow replacing an imported Pi proxy configuration

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: audit,game,agent,ui

At aa28100 Pi → Import proxy config uploads directly to the final
`/workspace/slopyard-agent/models.json` path (the `click` handler). Dolly's uploader
rejects existing paths with EEXIST before opening the picker (`upload.c:59`).
After one successful import, every subsequent attempt immediately reports
"Proxy import cancelled", although the user did not cancel anything.

Reproduced in a fresh browser with a credential-free `{"providers":{}}` file;
Pi stayed paused and no model requests were made. The first import succeeded;
the second displayed no file picker and showed the misleading cancellation text.
Evidence: `build/slopyard-audit-20260923/proxy-{first,second}-import.png` and
`build/slopyard-audit-ui.mjs` (91843 exit 0).

Import to a temporary path, validate and replace only after success. Retain the
old configuration on cancellation/invalid input. Apply an updated configuration
to the next connection, including an already-created agent session, and report
actual errors. Verify two imports and cancellation without a live model call.

Fixed by uploading to a temporary file and validating with Pi's actual model
runtime, with network refresh disabled. A successful import atomically replaces
the configuration and disposes the old connection; the next Start restores the
same conversation with the new model runtime. Import pauses inference and
practice. Invalid JSON, a missing Astra model and cancellation keep the old file
and session. The panel reports the validation result and stays paused.

Verified in Chrome with all compilation inside Dolly:
`test/slopyard-proxy-browser.mjs build/slopyard-proxy-source.tar`, under
the 4 GiB/no-swap browser limit. Two local endpoints held real Pi SSE requests;
four requests reached the original endpoint across failed/cancelled imports,
then the replacement reached the second endpoint with the same session ID,
`gpt-6-astra` and `xhigh`. Import aborted the active request, and validation made
zero network requests. No upstream model calls. Log:
`build/slopyard-proxy1.log` (exit 0); observations, request metadata and UI
screenshots: `build/slopyard-proxy/`.
