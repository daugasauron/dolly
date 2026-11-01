# A host bridge for HTML popups and forms; pi-dolly's ask-user extension

- STATUS: OPEN
- PRIORITY: 320
- TAGS: host-modules,pi,html,0.1.5

Owner (2026-11-01, 21:45 JST):

> I also want you to work on a task (and register in tatr). I want to have a new host bridge
> for HTML popups, so for example pi agent can render a HTML report to the user. I also want
> HTML forms to work, and I want you to extend pi-dolly with an extension "ask-user" that uses
> a HTML form to ask the user questions (then of course it should be able to act on the
> response)

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
