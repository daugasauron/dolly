# An image declares its own narrow network: HTTP rows, in npm's template and its video

- STATUS: OPEN
- PRIORITY: 220
- TAGS: 0.1.8,boundary,npm,http

The owner (2026-11-18): "In the npm demo setup, and in the packaging in general, I want the custom
image that's built to have some custom narrow network policy. And I want the demo video to
demonstrate that it works." Then: npm's Pi is "normal non-configured pi with some dolly environment
specific extensions/skills", nothing special for OpenRouter; and the video's image adds tmux with
the owner's `~/.tmux.conf`, Pi in window 1 and Neovim in window 2. Brief:
`work/briefs-2026-11-18/npm-policy.md`. Branch `feature/npm-policy`.

## State (2026-11-19, 00:25): done on `feature/npm-policy`; open for the merge's round and the release's take

Left: the round after the merge rebuilds what the branch changed (`clip`, new; `dolly-docs`, whose
documents changed, and the images that install it: the Pi images, Studio, ClassiCube, Slopyard, the RTS
arena, Seven Kingdoms, the local-model Pi images; Studio's archive), and the release makes the video
again from the published packages (`build/video/` of the branch's tree, `retake.sh`). None of it is
seed. Close after both.

The video, from this branch's packages (`scripts/package-npm.mjs`, served by a registry on
127.0.0.1): `build/video/npm-pi-agent.mp4` of `work/npm-policy` (3:00, take 2; `build/video/README.md`
there says what it shows and how it was made). The key never shows: the page's upload dialog brings
`~/.openrouter` in, and Pi's `/login` reads it with `!cat FILE`.

Measured on this tree's images (the round's pass 1 linked, and `clip`, `dolly-docs`, `pi-dolly`,
`pi-minimal`, `tmux`, `nvim`, `default`, `jq`, `less`, `seaborn` and `python-data` built here):

- `test/image-network-browser.mjs` passes in Chrome 156 and Firefox (Playwright's): the declared
  request answers; another path, method and host and a declared path the embedding does not admit
  are refused (curl 9) and never reach the server; a save whose record says its tab inherited no
  policy, opened where the page admits everything, keeps the rows. With `declared` taken out of
  `site/site.mjs` it fails at "another path".
- `test/http-refusals-browser.mjs` passes in Chrome and Firefox, `test/custom-session-browser.mjs` in
  Chrome; `demos/pi/test/frontend-browser.mjs`, whose orders API and model are now the recipe's
  HTTP rows in place of a route's policy, in Chrome and Firefox.
- `test/npm-browser.mjs` (packed from this tree, `DOLLY_NPM_PACKS`, offline) passes in Chrome and
  Firefox, nothing leaving the machine: Pi starts
  plain with the `sandbox` skill and the `/network` extension, which lists the rows; a row the test
  adds answers at its path, and another path, method and host are refused (curl 9); the build's
  summary lists the rows; the `python-data` project's site, whose recipe has none, refuses a request.
- `build/video/alt-keys.mjs` (headed, keys through the X server's XTEST, two tabs open): Alt+1 and
  Alt+2 reach a program as ESC 1 and ESC 2 in Chrome 156 and Firefox 155, and the tab stays.
- `build/video/tmux-trial.mjs` (the video's sandbox on the site's custom route, headed, X keys), in
  Chrome and Firefox: tmux starts with Pi in window 1 and Neovim in window 2; Alt+2 and Alt+1 switch
  them; tmux's `y` in copy mode copies through `clip` to the browser's clipboard (Chrome read back
  `copied-by-tmux\n`; Firefox's page marked the copy `copied`). In Chrome with the key of
  `~/.openrouter`, brought in by the page's upload dialog: Pi's `/login openrouter` (API key, the key
  `!cat FILE`) signs in; its default model (moonshotai/kimi-k2.6) answers through
  `POST /api/v1/chat/completions` and fetches the declared README path, while its probes of other
  hosts are refused with the page's notices; `anthropic/claude-haiku-4.5` answers through
  `POST /api/v1/messages?beta=true` with `x-api-key` alone, so OpenRouter's Claude models need no
  `models.json` entry.

## Design, as decided

- **The rows.** `HTTP METHOD... URL [HEADER...]` in a recipe: a rule of the page's policy
  (`docs/http.md`), the URL an origin and a path or, with a final `/*`, every path under it, the
  headers those beyond an ordinary request's that may go with it. The parser
  (`site/dollyfile-view.mjs`) checks each with the page's own normalization (`DollyHttpPolicy`), so
  an invalid row fails the recipe with its line; it gives `httpPolicy` ({ rules }) or null.
- **`DOLLY 8`, not a new version.** A recipe without rows means what it meant: no pin changes.
  A page too old for them refuses a recipe that has them ("unknown directive HTTP"). A version
  bump would change every recipe's first line, and so every pin and image, for no change of
  meaning. The engine never reads the rows: `recipeRows` leaves them out, so no engine (and no
  seed) changes, and an image built `FROM` an older base runs its base's engine unchanged.
- **Where they stand.** With the `REQUIRES HOST` lines, before every operation: they describe
  running the image. Never inherited (`FROM`, `INSTALL` carry none), as host requirements are not.
- **A package declares none.** The network is the opened image's, as its ENTRY is. So `amy
  install` changes nothing: a package's declaration joining a session by union would let the
  guest widen its image's by choosing what to install; by intersection it would cut the session
  off from what its image declares.
- **The page applies them.** `pageNetwork` (`page/network.mjs`) intersects the embedding's
  policy, any inherited one and the declared one (`restrictDollyHttpPolicy`): a request passes
  all, so a declaration never widens. Trusted code reads them from the recipe's text: the
  catalog's record (`httpPolicy`, written by `scripts/image-directory.mjs` and `dolly-build` from
  the recipe) for `boot()` and the site's routes, the custom image's recipe for a custom tab and
  its saves (`site/site.mjs`); never a snapshot or anything Wasm wrote. A restored session takes
  them again from its image's record or recipe; a tab opened from the page inherits them with its
  policy. They hold for everything the page fetches for the guest, a build in that page
  included (a rebuild route, Studio's `dollyfile-build`), since a guest-started build could
  otherwise fetch any URL. Their quota and limits are a policy's defaults (256 requests a page
  load), as the template's page policy had.
- **`dolly-build`.** Checks the rows with the parser, writes the image's record with them, and
  ends its summary with what the site may reach. A recipe without rows reaches nothing there
  (`{ rules: [] }`): a site one builds is not the public demo, whose page admits any host. An
  image without rows elsewhere keeps the page's policy.
- **`init`'s template.** The rows of the model providers Pi offers whose APIs answer a page, each
  as Pi calls it (below). The page's code holds no policy (`public/main.mjs`). Pi starts plain
  (`pi --offline`: its version and catalog requests are not declared); no `pi-key`, no
  `models.json`, no default model. Its skill is `sandbox` (the network, the image's tools, the
  workspace, upload and download), its extension `/network` (the recipe's HTTP rows), its tool
  `todo`. `docs/npm.md` has "The network" and "How it starts".

## The providers' rows: measured

Every provider and API of Pi 1.0.3's catalog (`pi-ai`'s `*.models.js`), one model each, run as
`pi -p hi` in Node with `fetch` recorded and answered 401 (nothing sent), then each endpoint sent a
CORS preflight from `http://127.0.0.1:8080` asking for Pi's headers (no credentials). Scripts and
output: `build/npm-policy-evidence/pi-measure/` of this tree (`run.mjs`, `requests.txt`, `preflight.mjs`,
`preflight.txt`), summarised here.

- A row each, POST, with the credential and protocol headers the provider's CORS admits: Anthropic
  (`/v1/messages`, `x-api-key anthropic-version anthropic-beta
  anthropic-dangerous-direct-browser-access`), OpenAI and xAI and Meta (`/v1/responses`), Gemini
  (`/v1beta/models/*`, `x-goog-api-key`), OpenRouter (`/api/v1/chat/completions` with
  `authorization`, `/api/v1/messages` with `x-api-key` alone), Vercel AI Gateway (`/v1/messages`
  without the browser header its CORS refuses), Mistral, Groq, Cerebras, DeepSeek, Hugging Face,
  Together, Moonshot (two), Ant Ling and Xiaomi (four) Chat Completions with `authorization`.
- Telemetry and affinity headers (`x-stainless-*`, `session_id`, `x-client-request-id`,
  `x-session-affinity`, `http-referer`, `x-openrouter-*`, `x-goog-api-client`) are not listed:
  the page removes them, which also keeps them out of a preflight the provider would refuse.
- OpenRouter's CORS refuses `anthropic-version` and `anthropic-dangerous-direct-browser-access`,
  which Pi sends to its Anthropic endpoint; without them it answers (measured 2026-11-18 with the
  key of `~/.openrouter`, one token: 200 with `x-api-key` alone). The 0.1.7 template's
  `models.json` workaround is not needed.
- Left out, with the reason in `docs/npm.md`: no CORS for a page (Baseten, Fireworks, NVIDIA,
  OpenCode Zen and Go, Z.ai both, Kimi's coding plan, Qwen's token plans, Cloudflare's gateway,
  MiniMax refuses `x-api-key`), GitHub Copilot (`/responses` and `/v1/messages` refuse the
  preflight; its sign-in is github.com's), an address of the user's account (Azure, Cloudflare,
  Vertex AI, Bedrock, whose client is the AWS SDK's Node handler), ChatGPT's Codex (OAuth only),
  Radius (its gateway configuration request was not measured).

## Other decisions

- **Data Pi** (`demos/pi/data-pi`) stays as it is: a project pinned to published 0.1.5 cannot carry
  rows its parser refuses. It moves with `tasks/20261114-070149-datapi`, now to the version that
  has the rows, from npmjs' tarballs, and then takes the template's rows and plain Pi.
- **The site's own Pi routes** are unchanged: their recipes had no OpenRouter default (`pi-minimal`
  and `pi-agent` start plain `pi`); `pi-key` stays in `pi-dolly` for them.
- **`clip`** (`Dollyfile-clip`), a package: copies its standard input to `clipboard@0`, the route
  for the owner's tmux `y` (`copy-pipe-and-cancel "clip"` for `xclip` on display `:1`). `tmux` and
  `clip` join `config/npm-images.txt`.
- The docs package carries `docs/dollyfile.md`, `http.md` and `browser-boundary.md`: their change
  rebuilds `dolly-docs` and the images that install it (the Pi images, Studio, ClassiCube,
  Slopyard, RTS arena). Studio's archive stages `page/http-policy.mjs` and
  `page/process-constants.mjs`, which the parser now imports.

## Done when

- Unit: `test/http-policy.test.mjs` (the intersection of a recipe's rows with a page and an
  inheriting tab) and `test/fixtures/dollyfile-syntax.mjs` (the rows the language takes and
  refuses, and the engine reading the rows of each accepted recipe) pass.
- Chrome and Firefox: `test/image-network-browser.mjs` (a declared request answers; another path,
  method and host and a declared request the embedding does not admit are refused; a save of the
  image keeps its rows where the page admits everything) and `test/npm-browser.mjs` (the
  template's flow) pass.
- The video: the npm flow from local release-candidate packages, showing the rows in the
  project's recipe, Pi answering through the model, `curl` to another host refused with the page's
  notice, and the customization (tmux with the owner's config, Pi and Neovim) with one more row
  answering at its path only.
