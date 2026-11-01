# A host bridge for HTML popups and forms; pi-dolly's ask-user extension

- STATUS: OPEN
- PRIORITY: 320
- TAGS: host-modules,pi,html,0.1.5

## State (2026-11-02 04:45 JST)

Every part of the done-when is written and measured in Chromium and Firefox; the task stays
open until the catalog holds the new and changed images (a round) and the owner has seen it.

- `html@0` (`d82f7474`, wording `3bb52f36`), the page's font in the popup (`9ddc5e32`) and
  `test/html-browser.mjs` (`cf5fd1eb`): pass on this tree's own seed (`ea109605`) and on the
  round's of 00:51 (`896df05e`).
- Pi's `ask_user` and `show_html` (`4c4bba89`, `aaed334e`) and
  `demos/pi/test/ask-user-browser.mjs`: pass on a real `pi-runtime` (Chromium 14.2 s,
  Firefox 16.8 s at 03:09; 17.9 s and 22.3 s at 03:15) and, before that, on a Pi the page
  built without ripgrep and fd.
- `test/npm-browser.mjs` (the README's Pi with npm, with `dolly-host-html`, and pi-minimal
  declaring `html@0`): passes in Chromium (17.2 s) and Firefox (19.2 s) at 03:13, with A's
  builder fix `e210dbe4` (taken here as `45c28eef`).
- Beside the module, on this tree's seed: core, host-modules, nena, embedding, boundary,
  upload, indicators, terminal and shell pass in both browsers.

The 896df05e runs used the round's images linked from `work/integrate` and its working
tree's recipe pins for its new Rust seed, copied here for the runs and not committed. The
round restarted at 04:40 on a seed change (`129d9fe1`), so the catalog needs that round's
images for `html`, `dolly-docs` and the Pi family: `pi-dolly`, `pi-runtime`, `pi-minimal`,
`pi-agent`, `pi-local`, `pi-phone`, `bhop`, `slopyard`, `rts-arena`, `classicube`,
`dollyfile-studio`, which now declare `html@0`.

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
  answer once; `test/html-host.test.mjs` drives it with a hostile kernel's calls. A
  compromised userspace that withdraws and shows popups in a loop takes the page's focus
  each time: an annoyance it can cause through the terminal too, which grants nothing (the
  user's keys in the popup reach the program only in a form the user submits), so no rate
  beyond the 2 s after a close.
- **Commands**: `html [FILE]` reads FILE or standard input, prints the fields on one line
  and exits 0, exits 1 when the user closed the popup, 2 on an error (grep's convention:
  1 is "no answer", not a failure). A script asks with `answer=$(html form.html)`; a report
  is `html report.html`, which waits until the user closes it.
- **Package, not seed**: the header, client and command are the `html` package
  (`Dollyfile-html`, the manifest's `package`), so the seed and every image that does not
  install it are unchanged by the module: `build:runtime` gave image inputs `ea109605` both
  with the module and with its manifest entry and import taken out (measured 23:18).
  Pi-dolly installs it; `default` does not (what a base image contains is the
  owner's call), and `nena enable html` then `amy install html` give it there (amy refuses
  the package while the module is off; measured in both browsers, the popup's form then
  answers `a=1`).
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
embedding themes popups with CSS custom properties on boot()'s element, read each time a popup
opens (`--dolly-html-background`, `-color`, `-accent`, `-font`, `-color-scheme`; unset, Dolly's:
#262626, #e8e3d7, #f2d45c, `ui-monospace, monospace`, dark), documented in
`docs/embedding.md`; the page sets them in the frame through CSSOM, which the CSP does not
govern, so no value is parsed into the frame's markup. Fonts: the popup fetches nothing, so a
web font of the page cannot load there by URL. `--dolly-html-font-file: url(…)` names the font
file of the first family of `--dolly-html-font`; the page fetches it once (its own request, of
a URL the embedding's style sheet names) and hands the frame its bytes, which the frame's
script makes a `FontFace` of. Measured (`exp/font-exp.mjs`): a `FontFace` from an
`ArrayBuffer` loads under `default-src 'none'` in Chromium and Firefox (status `loaded`, and
ten `i` at 16 px measure 80 px, Iosevka's half-em advance). Dolly's `terminal.html` sets
Iosevka and its file, so the site's popups have the terminal's font.

Screenshots of a report and a form on the site's page, Chromium and Firefox:
`build/html-bridge-evidence/popup-{report,form}-{chromium,firefox}.png` (this machine only).

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

## Findings beside the module

- **A deferred process call copies its request again on each retry**
  (`src/process-supervisor.mjs` `#syscall`, every 16 ms and at each `serviceDeferred()`):
  the kernel has one mailbox for every process, so it must. Moot for small requests (a path);
  a module whose request is large must return at once and defer a second, empty call, as
  `html@0`'s `SHOW` and `WAIT` do. Written in the design above; nothing to change.
- **An srcdoc frame's relative URLs resolve against its parent**: `href="#here"` navigated
  Chromium's sandboxed popup to the page's own URL, a request to the page's origin. Nothing
  of a program's links reaches the popup, so `html@0` is not affected; another module that
  shows srcdoc content would be.

## Proposals for the owner

- `default` (and `system`) could install the `html` package, so a shell user has `html`
  without `nena enable html` and `amy install html`: a base-image change, yours to make.

## Lessons

- Measure the browser before designing a sandbox. CSP and `sandbox` are not a network
  boundary for a frame's own navigation (no shipped directive governs it), and a srcdoc frame
  resolves `#x` against its parent's URL; a 20-minute experiment with the hostile HTML placed
  raw in the intended frame showed both, and turned the design from "sanitize, then trust CSP"
  into "build the popup from an allowlist; CSP is the second layer". Count connections, not
  only requests: the preconnect showed only as a TCP connection.
- Mutate each layer to learn which one a test exercises. Copying `style` attributes into the
  popup left the test green, because the frame's CSP refused them; copying links turned it
  red in Firefox. A test of defense in depth passes while one layer is gone.
- Every Pi image holds rust-llvm and rust-build, through the `pi` package's ripgrep and fd,
  so after any seed change a Pi feature cannot be measured in a 6 GB build slot that night.
  Pi's npm tree alone needs only janis-install's closure (no Rust), which gave the first
  evidence; linking a round's images gave the rest, but only after this tree also had the
  round's Rust seed (`build/rustc-port`, which every build restages into `dist/static`) and
  its recipe pins: an image is reused only where recipe, pins and staged sources all match,
  and a build that finds one Rust pin changed plans rust-build at once (stop it on the plan
  line, before it starts).
- Read the clock before planning against a deadline: I put the time 15 minutes late and
  declined a hugebuild slot whose estimate would have fitted.
- Rewriting a task's State "up to the next heading" silently dropped the owner's words that
  sat between State and Done-when; a diff of the owner's lines against the first commit of
  the task caught it. Replace a section by its own markers, and diff before committing.
