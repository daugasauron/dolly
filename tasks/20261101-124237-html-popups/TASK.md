# A host bridge for HTML popups and forms; pi-dolly's ask-user extension

- STATUS: OPEN
- PRIORITY: 320
- TAGS: host-modules,pi,html,0.1.5

## State (2026-11-01 22:30 JST)

`html@0` (host/html/), the `html` command and package (Dollyfile-html), Pi's `ask_user` and
`show_html` (demos/pi/ask-user.js) and the recipes that declare the module are written; the
page side was measured in Chromium and Firefox outside Dolly (below). Building `default`,
`system` and `html` on this tree's runtime; the module's browser test waits for them. The Pi
test waits for a Pi image on this seed: every Pi image holds rust-llvm and rust-build, which
the integrator's round of 2026-11-02 rebuilds.

Owner (2026-11-01, 21:45 JST):

> I also want you to work on a task (and register in tatr). I want to have a new host bridge
> for HTML popups, so for example pi agent can render a HTML report to the user. I also want
> HTML forms to work, and I want you to extend pi-dolly with an extension "ask-user" that uses
> a HTML form to ask the user questions (then of course it should be able to act on the
> response)

Owner (2026-11-01, 21:55 JST), forwarded by the integrator:

> That sounds good, but I want the theme of the form to match the rest of the page, so some kind
> of styling would be needed but it shouldn't be owned by the agent side

## Done-when

- A host module (its own `host/NAME/` directory and manifest) lets a program show the user
  an HTML page in a popup inside `boot()`'s element, and show an HTML form whose submitted
  fields come back to the program; closing or cancelling is reported to it as such.
- The popup grants no authority `AGENTS.md` does not allow: its HTML reaches no network
  (images, styles, fonts, links, navigation, form actions, scripts all refused), runs no script
  of its own, and cannot reach the page; the row in `docs/browser-boundary.md` says so, and
  browser tests prove each refusal in Chromium and Firefox.
- pi-dolly has an `ask-user` extension: the model asks the user questions through an HTML form
  and receives the answers as its tool's result, and acts on them; Pi can also show an HTML
  report. A test drives a scripted model through both in a real browser.
- The images that install pi-dolly declare the module; the npm package for the module exists.

## Design

One module, `html@0`, of the shape of `download@0`: one kernel import, two process operations,
no mailbox and no lease (a popup is one exchange, not a device a process streams to, so the
leased-device protocol D's audit describes does not fit and is not copied).

- **Contract** (`host/html/dolly-html-0.wat`, `html.h`): process operation `SHOW` (192, the
  next free block of 16) takes the document, 1 byte to 1 MiB of UTF-8, as its request (the
  process packet limit is 1 MiB, so no path and no chunking); `WAIT` (193) has no request
  and answers the fields. `SHOW` returns at once; `WAIT` is deferred until the user acts.
  Two operations, not one, because the supervisor copies a deferred call's request again
  on every retry (every 16 ms): one operation would copy the document 60 times a second
  while the user reads. The kernel's import `dolly_html_dispatch(operation, span)` has
  `OPEN` (the document), `ANSWER` (where the fields go: `EAGAIN` until the user acts) and
  `CLOSE`. The client's `dolly_html_show(document, size, fields, capacity)` makes both
  calls.
- **Answer**: the submitted form's fields as `application/x-www-form-urlencoded`, exactly
  what a browser posts for a form (its entries in tree order, the submit button's name and
  value among them), at most 64 KiB; `ECANCELED` when the user closed the popup. Every
  language parses it; repeated names (checkboxes, multiple selects) and the button pressed
  survive, which JSON of a flat object would not say without a convention of its own.
- **Bounds**: one popup at a time (another process's `SHOW` waits, as a second download
  does; a process's own second `SHOW` replaces its popup); after the user closes one, the
  next is refused with `ECANCELED` for 2 s, as `upload@0` refuses a picker after a cancel,
  so a program cannot reopen a popup faster than the user can reach Ctrl+C. Process exit
  removes the popup (the kernel's release hook). The Worker side checks every span against
  the memory, decodes the document with a fatal UTF-8 decoder (`EILSEQ`), and gives each
  answer once; `test/html-host.test.mjs` drives it with a hostile kernel's calls.
- **Commands**: `html [FILE]` reads FILE or standard input, prints the fields on one line
  and exits 0, exits 1 when the user closed the popup, 2 on an error (grep's convention:
  1 is "no answer", not a failure). A script asks with `answer=$(html form.html)`; a report
  is `html report.html`, which waits until the user closes it.
- **Package, not seed**: the header, client and command are the `html` package
  (`Dollyfile-html`, the manifest's `package`), so the seed and every image that does not
  install it are unchanged by the module (`scripts/build.sh` leaves a packaged module's
  header and archive out of the seed). Pi-dolly installs it; `default` does not (what a base image contains is the
  owner's call), and `amy install html` plus `nena enable html` give it there.
- **No Janis binding**: Pi's tools run the `html` command (child_process, the document on
  stdin) instead of a `Dolly.html()` that Janis would link. Janis is linked into every
  JavaScript image (typescript, janis-install, the Pi family, …); a binding would make every
  one of them record and declare `html@0`. With the command, only images that install the
  `html` package do, and Pi uses what a shell user and a script use.

### The popup, and why it is safe

HTML from a program is hostile. The page never parses it in a page that could load or
navigate:

1. The page side creates `<iframe sandbox="allow-scripts allow-forms" srcdoc=…>`: an opaque
   origin (no `allow-same-origin`), no popups, modals, top navigation or downloads. Its
   document is the page's own: a CSP `<meta>` first (`default-src 'none'; script-src
   'nonce-N'; style-src 'nonce-N'; form-action 'none'; base-uri 'none'`), the page's style
   sheet and the page's one script, both with the nonce. The program's document is a JSON
   string literal inside that script (`<` escaped as `\u003c`, so it cannot end the
   script).
2. The script parses the document with `DOMParser` (an inert document: no fetch, no script,
   no navigation) and copies its text and an allowlist of content and form elements and
   attributes into new elements of the frame's document. No element that loads, links,
   refreshes or styles exists in the popup: no `a`/`area` with an `href` (a link's text
   stays), `meta`, `base`, `link`, `img`, media, `svg`, `math`, `iframe`, `object`, `style`,
   `script`, no `style`/`class`/`on*`/URL attribute, no password, file or image input.
3. The script reports a submitted form (`submit` is cancelled and `new FormData(form,
   submitter)` encoded) and Escape to the page by `postMessage` to the page's origin; the
   page takes messages only from that frame's window and checks their shape.

Why step 2 is needed beside the CSP and sandbox, measured (`exp/frame-exp.mjs`, a sandboxed
srcdoc frame with that CSP and the hostile HTML placed in it raw, recorder on another port):
the CSP stops every subresource in both browsers (img, srcset, picture, poster, video,
audio, stylesheets, `@import`, `url()`, fonts, prefetch, preload, modulepreload, icon,
manifest, object, embed, iframe, input image, svg image/use, script, inline script,
`onerror`), but not navigation, which no shipped CSP directive governs (`navigate-to` was
dropped): with `allow-scripts`, `<meta http-equiv="refresh">` reached the recorder in
Chromium (`GET /refresh`, then the frame showed an error page); a click on a link reached it
in Firefox (`GET /link`); a link to `#here` navigated Chromium's frame to the page's own URL
(an srcdoc document's base URL is its parent's); and a `<link rel="preconnect">` opened a TCP
connection to the recorder in every mode in both browsers. Without `allow-scripts` the page
cannot read the form at all from an opaque origin. So the popup is built, not sanitized
from a string: no serialization round trip (no mutation XSS), and what is not on the
allowlist does not exist.

Measured with the page side alone (`exp/popup-exp.mjs`, html.mjs's `browser()` in a page of
its own with COOP/COEP): the same vectors plus `<base>`, refresh, preconnect, dns-prefetch,
`javascript:` links, `formaction`, `target=_top`/`_blank`: no request and no connection
reached the recorder in Chromium or Firefox; the program's `style` attribute and
`!important` style element did not apply (the heading has the page's accent); the form round
trip gave `name=Ada+%3CLovelace%3E+%26+co&lang=c&lang=rs&note=a+%3Cb%3E+%26+c&ok=on&choice=yes`
in both; Escape in the frame closed it; the terminal had the keyboard again. DNS prefetch was
not observed separately (the recorder sees TCP, not DNS); nothing that names a host is
copied into the popup.

### Style: the page's, not the program's

Owner, 21:55: the form's theme matches the page and is not the agent's. The program sends
content; the page's style sheet draws it (headings, paragraphs, lists, tables, `pre`, forms,
inputs, buttons, focus, invalid fields). A program may style nothing: its `style` and
`class` attributes and `<style>` elements are not copied, and the frame's CSP would refuse
them anyway, which also closes CSS as a channel (selectors that fetch per matched value). An
embedding themes popups with five CSS custom properties on boot()'s element, read each time
a popup opens (`--dolly-html-background`, `-color`, `-accent`, `-font`, `-color-scheme`;
unset, Dolly's: #262626, #e8e3d7, #f2d45c, `ui-monospace, monospace`, dark), documented in
`docs/embedding.md`; the page sets them in the frame through CSSOM, which the CSP does not
govern, so no value is parsed into the frame's markup. The popup loads nothing, so its font
is one the system has: the site's Iosevka is a web font and does not reach it (a font's
bytes could be handed over as a `FontFace` from an `ArrayBuffer` if the owner wants it).

### Pi

`demos/pi/ask-user.js`, loaded by Pi from `~/.pi/agent/extensions/` beside dolly-tools.js:
`ask_user({ title, questions: [{ question, choices?, multiple? }] })` builds the form (a text
area, radio buttons, or checkboxes), runs `html` and returns
`[{ question, answer }]` as JSON, or that the user closed the form; `show_html({ html })` shows
a document, such as a report, and returns that the user closed it or the fields of a form of
it. The model gets structured questions to fill rather than writing a form itself. pi-dolly
installs the `html` package and declares `html@0`, and so do the images that install it or
are built from pi-runtime (bhop, slopyard, pi-minimal, pi-runtime, pi-agent, pi-local,
pi-phone, rts-arena, classicube, dollyfile-studio): the lint found the installers, and the
images built FROM pi-runtime keep `/usr/bin/html`, which sealing refuses undeclared.
