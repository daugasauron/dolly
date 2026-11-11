# Requests the HTTP policy refuses: a notice on the page and a line in the console

- STATUS: OPEN
- PRIORITY: 360
- TAGS: http,ui,npm,0.1.6

The owner, 2026-11-11 10:00 JST, from using the npm packages:

> I want a popup and console log to show requests that get blocked by the policy. The popups
> should be permanent until closed (some x button or something). Need to handle the case where
> too many blocks to display at the same time happens, and a way to "close all" etc.

## State (2026-11-11)

Done on `fix/http-notices`: the transport tells the page of each refusal (`host/http/broker.mjs`,
`refused`); `host/http/refusals.mjs` logs it with `console.warn` and keeps a notice in boot()'s
element until its × closes it, one notice and a count per method and URL, the five newest with a
line for the rest and **Close all**, URLs without their query. `test/http-refusals-browser.mjs`
passed in Chrome and Firefox on images before the 0.1.6 bump; `docs/http.md` says it. Left: the
test on the round's images.

Done when a browser test (Chrome, Firefox) refuses requests and sees the console lines, the
notice with its count, the line for the ones not shown, × and **Close all**, and the docs say it.
