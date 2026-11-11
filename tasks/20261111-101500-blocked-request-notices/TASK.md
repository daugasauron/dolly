# Requests the HTTP policy refuses: a notice on the page and a line in the console

- STATUS: OPEN
- PRIORITY: 360
- TAGS: http,ui,npm,0.1.6

The owner, 2026-11-11 10:00 JST, from using the npm packages:

> I want a popup and console log to show requests that get blocked by the policy. The popups
> should be permanent until closed (some x button or something). Need to handle the case where
> too many blocks to display at the same time happens, and a way to "close all" etc.

## State (2026-11-11)

Not started. The broker refuses in the Worker (`host/http/policy.mjs`, `authorize`: `EACCES`,
"Dolly HTTP policy denied the request"); the program sees the error, the page nothing.

Plan: each refusal reaches the page with its method and URL without the query (a query may hold
a credential), and the page logs it with `console.warn` and lists it in a panel of notices in
boot()'s element. A notice stays until its × closes it; refusals of one method and URL are one
notice with a count; at most a few show, with a line for the rest, and **Close all**.

Done when a browser test (Chrome, Firefox) refuses requests and sees the console lines, the
notice with its count, the line for the ones not shown, × and **Close all**, and the docs say it.
