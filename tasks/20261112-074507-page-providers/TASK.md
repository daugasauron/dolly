# Page providers: console backpressure, html limits, packages quota, display frame, session wording, review map

- STATUS: DONE
- PRIORITY: 240
- TAGS: host-modules,security,docs,browser-boundary,audit,0.1.6

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, S4, S6, S7, S8, section 6 items 1-3, 2026-11-07 F15).

## State (2026-11-13)

Autofill, measured in a headed Chrome 156 on the private display, with an address saved through its
own settings page (`work/evidence-2026-11-13/autofill/`: the script and two screenshots). Chrome offers
it on an email field in the page, and on the same field in html@0's popup: choosing it would fill every
address field of the program's form, seen or not. Under `autocomplete="off"` Chrome still offers it in
the popup; under a token it does not know it offers nothing. So the popup's forms say `off` and its
controls an unknown token, which by the HTML standard defers to the form's `off` (Firefox's rule).
DevTools' `Autofill.setAddresses` reached no field, not even the page's, so it measures nothing.
`test/html-browser.mjs` passes in Chromium and Firefox. Firefox's address autofill was not measured:
the installed Firefox does not start in a unit here, and Playwright's keeps no addresses. Closed.

## State (2026-11-12)

On `fix/batch` (`dd1087119`): console backpressure (the page holds a 4 MiB window per stream and
the Worker stops reading past it), html's caption and its notice for an answer over 64 KiB,
packages counted when found, frame dimensions bounded, the session and review-map wording.

On `fix/console-interrupt`: the sessions page's Import says which modules the save starts with (its image's, or those its
Dollyfile names); a test for each behaviour: `console-browser.mjs` (20 MB nobody reads waits,
then arrives whole), `html-browser.mjs` (the notice), `amy-browser.mjs` (65 misses, then an install), `display-transport.test.mjs`
(a frame within the capacity but past the largest width or height; fails without the check),
`custom-session-browser.mjs` (the import names each module; passed in Chromium and Firefox).
Not done, decided: the quiet period after an answer. An agent asks its next question at once
(Pi's ask-user: a form, then the report), which two seconds of refusal would end as if the user
had closed it. A click meant for the last popup landing on the next is better met by the new
popup ignoring activation for a moment than by refusing it; not measured as a problem yet.
Left: the autofill measurement on `email`, `tel` and `cc-number` fields. Tried (2026-11-13): Chrome's
`--show-autofill-type-predictions` writes no prediction into any field in headless Chrome 156, not
even on a plain top-level form, so it measures nothing there. The popup's sanitizer passes no
`autocomplete` attribute and no password field. Next: a headed Chrome and Firefox with a profile
that holds an address and a card, offering on a field in the popup or not.

## Do

- `console@0`: the Worker stops reading a console while more than a few MiB are unacknowledged
  (`host/console/console.mjs:34,46,66-72`); the page queue is bounded.
- `html@0`: a submission over 64 KiB says so instead of nothing (`host/html/html.mjs:121`); the quiet
  period follows a submit too (`:219`); measure autofill offers on `email`/`tel`/`cc-number`
  fields in Chromium and Firefox.
- `packages@0`: count a served package on success, not before it is found
  (`host/packages/service.mjs:59-60`).
- `display@0`: check each frame dimension, not only `stride * height` (`host/display/display.mjs:263-266`).
- Sessions: the custom-image check proves the file is self-consistent, not where it came from;
  reword `host/snapshot/snapshot.mjs:32-36` and `docs/sessions.md:55-59`; the sessions page's Import
  names the modules an imported save will have.
- `docs/browser-boundary.md`: `src/route.mjs` in "Trusted files"; `console@0` in the diagram.

## Done when

Each is in with a test where it changes behaviour (console, html, packages, display), and the review
map matches the code.
