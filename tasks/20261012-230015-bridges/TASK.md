# Host bridges enabled from inside the runtime: bridges@0 and nena

- STATUS: OPEN
- PRIORITY: 340
- TAGS: host-modules,core,owner

Owner (2026-10-13): "I also want to add a new host module that makes it
possible to add host bridges from inside the runtime, and the default one
should have it. So when you try tu install tmux for example it would say
\"need to enable pty host module\" and it can be done inside the runtime. The
config/status of the host bridge should be controlled by a command line tool
called nena."

Done when: in a `default` session `amy install tmux` names the module and the
command that enables it, `nena enable pty` enables it there, tmux then
installs and runs, and `nena` lists every module with its state; a module
that carries browser authority is enabled only by the user's press of the
page's own button; tested in Chromium and Firefox.

## As filed: the integrator's decisions (change one with its reason)

- The module is `bridges@0`, the command `nena`, as `packages@0` is to `amy`.
  `default` declares it. An image that does not declare it is as today:
  nothing can be added to it.
- Assume the userspace compromised: the page, not Wasm, holds the set a
  session may use, the image's declared modules and those enabled since.
  A module's `module.json` says how it is enabled: `"enable": "free"` (no
  browser import and no page side, such as `pty`), `"enable": "ask"` (the
  page shows its own prompt naming the module and what it gives, and only
  the user's press enables it: microphone, GPU, audio, buttons), absent: not
  at run time. The list is short and in one place to review.
- `nena` (no argument: every module, declared, enabled or available, and what
  it gives), `nena enable NAME`, `nena disable NAME` (one enabled at run
  time; it holds for processes started after).
- `amy` and the loader name the command: "tmux needs pty@0: nena enable pty".
- What is enabled lasts for the page load; a restored session asks again.
- It changes the seed (a client, a header, a command, `default`'s recipe) and
  the browser boundary: `docs/browser-boundary.md`, `docs/process-model.md`
  and the sentences of `AGENTS.md` that say "only for an image that declares
  the module".
