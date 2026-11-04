# amy's package service off the broker, http@0 switchable

- STATUS: OPEN
- PRIORITY: 60
- TAGS: host-modules,audit,amy,http

From the module audit (`tasks/20261104-135806-module-audit`, R5, section 4 item 3). Only if the
owner wants `default` without `http@0`.

`packages@0` rides the HTTP broker as a reserved origin (`https://packages.dolly.invalid`,
b60b426a2; `host/packages/module.json` depends on `http@0`), so `amy` needs `http@0`, and so does
every image that installs it (`default`, `tmux-panes`, `ghostty-x11`, `x11-desktop`, the agents).
`http@0` is fixed: "the page's HTTP policy is consumed once, at load" (`host/http/module.json`), so
`nena` cannot give it to a session later.

- `packages@0` hands the verified snapshot over its own channel, as `upload@0` hands a file: one
  dispatch import, a client, `amy.c`'s `fetch` replaced; a row in `docs/browser-boundary.md`.
- The index (`amy-index.txt`) comes over the same channel.
- Then `default` either drops `curl`, or `http@0` stops being fixed so `amy install curl` can be
  followed by `nena enable http` (`host/http/http.mjs` keeps the policy from load; the transport
  could start on enable).

Cost: a module contract, the client in the seed, amy, `default` and the images with amy; a round.

## Done when

- The owner has decided whether `default` keeps `http@0`. If not: `amy` declares `packages@0`
  alone, `amy install` works in an image without `http@0` in Chromium and Firefox
  (`test/amy-browser.mjs`), and `http@0` appears only on images with a program that fetches.
