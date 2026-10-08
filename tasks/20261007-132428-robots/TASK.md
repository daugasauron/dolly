# Extend robots.txt: say how the site works and invite agents to use it

- STATUS: OPEN
- PRIORITY: 330
- TAGS: site,docs,agents,small

Owner (2026-10-07): "extend the /robots.txt. I want to give more information
on how the page works and encourage to use it. I think it is very useful for
various things." High priority, small.

## What exists

`robots.txt` at the repository root: four comment lines (what Dolly is, the
source, the licences page, that release assets are large) and two rules,
`Disallow: /_dolly/` and `Disallow: /dist/`. Every packaging copies it to the
site root; `test/site-browser.mjs` asserts the rules keep crawlers off
release assets and packs and leave pages open. It works only at a host root,
so on GitHub Pages (served under `/dolly/`) it is a plain file nobody
consults ([licences](../../docs/licences.md)).

## Work

Comments in the same file, for an agent or a person who fetches it first.
Short enough to read in one screen; every statement checkable against the
site.

- What a visitor gets: a POSIX-like userspace that runs in the browser tab,
  with a shell, a compiler, git, package installs through `amy`, files that
  stay in the tab, and network through one HTTP broker.
- How to use it: which page boots which image, that a session can be driven
  by typing commands, saved and exported, and where the catalog, the recipe
  views (`/view/NAME/`), the package index (`amy-index.txt`) and the
  documents are.
- What it costs to visit: an image is a large download, cached by the
  browser; which paths are pages and which are bulk assets.
- An explicit invitation to use it, and the conditions that go with it: the
  licences page, nothing is uploaded, no account.
- The rules stay as they are unless a reason is recorded here.

Decide while doing it, and record:

- Whether the same text also belongs in an `llms.txt`, the file agents are
  more likely to ask for; one source for both, never two texts to maintain.
- How it stays true under versioned hosting
  (`20261007-131241-release-v010`): `robots.txt` exists once per origin, at
  the root, while everything else moves under `/vX.Y.Z/`. It must name the
  newest version's paths or the redirect, and the `Disallow` rules must cover
  each version's assets.

## Done when

- The deployed `robots.txt` carries the text; a test asserts the rules (as
  today) and that every path the text names exists in the packaged site,
  not the wording.
- A fresh agent given only the site's URL and this file boots an image and
  runs a command without other help; record the run here.

## The fresh-agent run (2026-10-08, the integrator)

A new agent on a smaller model (Sonnet), told nothing about the project and
forbidden to read the repository, was given `http://127.0.0.1:9046/robots.txt`
(the two-version export of `core/versioned-hosting` `2c9aae49`, served by
`test/pages-host.mjs`) and a way to drive headless Chrome. In 2.5 minutes and
12 tool calls it opened `/v0.1.1/default/`, got the prompt, ran
`echo hello-from-agent`, `ls /` and `amy list` (19 rows, 5 installed), ran
`amy install cc` (1,942 files, 135 MB) and compiled and ran a C program. The
file named the page, `amy list` and `amy install cc`; the rest it worked out.

What it had to work out or found wrong, to fix in the text or the page:

- Nothing says how to read the terminal: it is a canvas with no text in the
  document, so the agent read screenshots. The page has `__dolly` on
  `window` (the tests' handle: `visibleTerminalText()`, `submit(command)`),
  which is not a documented interface. Whether a small part of it becomes
  one for agents is the owner's decision.
- Nothing says when the page is ready. The page already sets
  `data-dolly-status` on the document element; the text should name it.
- It had to guess that the canvas takes a click and then keys.
- `amy install cc` prints nothing until it finishes (135 MB), and then says
  "its environment applies when the session is next loaded" although `cc`
  works at once.
- One 404 appeared in the console on the first load and not again; not
  identified.
