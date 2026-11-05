# An agent in place of a web frontend

A page can give its users an agent instead of a frontend: Pi, instructions for
how to work in your company, skills that describe an existing system's API, and
an HTTP policy that admits that API and the model's provider and nothing else.
The agent does through the API what the frontend did; the backend stays as it
is. This guide builds such a page from the npm packages ([Embedding](embedding.md)).

## Start

Make the README's "Pi with npm" first: `npx dolly-build init my-pi git` writes
a project that runs `pi-minimal` (Pi, a shell, POSIX tools, curl, ripgrep and fd)
with Git under a policy that admits OpenRouter alone, and `dolly-build` builds
its image. This guide changes its files:

```
Dollyfile-my-pi               the sandbox: Pi's instructions, skills, extensions, tools, how Pi starts
public/index.html             the page: the policy, relays, and the files it writes at boot
public/workspace/             the project Pi works on, written into /workspace at each boot
my-pi/                        the site dolly-build writes, for a static host
```

## Pi's files

Pi reads its instructions, skills, extensions and model endpoints from files
in `~/.pi/agent/` (Pi's `docs/configuration.md`, in the image under
`/usr/lib/node_modules/@earendil-works/pi-coding-agent/docs/`). `init` wrote
them as `FILE` rows of the recipe, each body indented four spaces, so they are
part of the image the page serves; a change is a rebuild (10 s).

- `FILE /home/dolly/.pi/agent/AGENTS.md`: instructions Pi takes into every
  session: who the users are, what they may ask, what never to do.
  `APPEND_SYSTEM.md` adds to the system prompt instead; `SYSTEM.md` would
  replace the image's, which tells Pi what Dolly is and what fails there.
- `FILE /home/dolly/.pi/agent/skills/NAME/SKILL.md`: a skill, which Pi lists by
  its description and reads when a task needs it. Files a skill refers to go
  beside it, each its own row:

  ```markdown
  ---
  name: orders
  description: The shop's orders API - list orders, cancel one. Use it for every question about orders.
  ---
  Base URL https://api.example.com/api; every request sends
  `Authorization: Bearer $ORDERS_TOKEN` (set; never echo it), with curl from the bash tool.

  - GET /api/orders: JSON array of {id, customer, item, status}
  - POST /api/orders/ID/cancel: cancels an order; 409 once it has shipped
  ```

- `FILE /home/dolly/.pi/agent/extensions/NAME.js`: a Pi extension in JavaScript
  (Pi's TypeScript extensions are not measured in Dolly). The image's
  `dolly-tools.js` is one.
- `FILE /home/dolly/.pi/agent/models.json`: a model endpoint Pi does not know by
  name (below).
- `FILE /etc/dolly/init.slop`: how Pi starts (below).

A file the page writes at boot instead, as it writes `workspace/`, is a build that
keeps the image (seconds) rather than a rebuild: `boot()`'s `files` takes `{ "/home/dolly/.pi/agent/AGENTS.md": text }`
beside the workspace's ([Embedding](embedding.md)). Files are not secrets: Pi's
tools can read them, and so can its model.

## Your backend

A rule admits the API's origin, the paths and methods the agent may use, and
the header that carries its token (`credentialHeaders`); [HTTP](http.md) has
every field. The backend answers CORS for the page's origin, preflights of
`Authorization` and `POST` included, and takes bearer tokens: Dolly's requests
never carry cookies. It answers itself; the broker follows no redirect under a
policy. A backend that cannot answer CORS is reached through a relay (below).

## The model's provider

- A provider Pi knows by name (Pi's `docs/providers.md`), such as OpenRouter,
  Anthropic or OpenAI: the `pi-key` line of `init.slop` names the variable Pi
  reads for it, the provider and a model of its catalog (`--provider` needs
  `--model`; `/model` in Pi changes it for the session), and the page's policy
  has one rule for its API with the header that carries the key. `init` writes
  OpenRouter (`OPENROUTER_API_KEY`, `authorization`) and, as a comment on the
  next line of each file, Anthropic's API with your own key (`ANTHROPIC_API_KEY`,
  `x-api-key`; Pi sends the `anthropic-dangerous-direct-browser-access` header
  its CORS requires). OpenAI's is `OPENAI_API_KEY` with `authorization`; it
  answers the preflight, and its error answers carry no CORS header, so a
  refused key reads `Connection error.` in Pi. There is no login: a key, typed
  at the prompt. Pi sends
  OpenRouter's `anthropic/*` models through Anthropic's Messages API, whose
  browser header OpenRouter's CORS refuses; `init`'s `models.json` row sends
  them through Chat Completions, one `id` per Claude model you want there.
- An endpoint that speaks OpenAI's or Anthropic's API, such as your gateway
  (LiteLLM, Azure OpenAI, a proxy of your own): an entry in `models.json`,
  whose `apiKey` names the variable the key is in, a `pi-key` line with that
  variable, `--provider company --model MODEL`, and a rule for its origin:

  ```json
  { "providers": { "company": {
    "baseUrl": "https://llm.example.com/v1", "api": "openai-completions", "apiKey": "$COMPANY_LLM_KEY",
    "models": [{ "id": "MODEL" }] } } }
  ```

- Amazon Bedrock: its OpenAI-compatible endpoint, as such an entry, with a
  Bedrock API key, through a relay; it serves the models that support Chat
  Completions (AWS's Bedrock user guide lists them). Pi's own `amazon-bedrock`
  provider does not run in Dolly: it sends through the AWS SDK's Node handler,
  which Janis does not have.

  ```json
  { "providers": { "bedrock": {
    "baseUrl": "https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1", "api": "openai-completions",
    "apiKey": "$AWS_BEARER_TOKEN_BEDROCK", "models": [{ "id": "openai.gpt-oss-120b-1:0" }] } } }
  ```

- GitHub Copilot: Pi's `github-copilot` provider with `COPILOT_GITHUB_TOKEN`,
  through a relay for `https://api.individual.githubcopilot.com` (or your
  enterprise's Copilot host).

Bedrock and Copilot refuse the CORS preflight of the headers Pi's clients send
(`x-stainless-*` and others), so the page reaches them through a relay.

## Hosts without CORS: relays

A static host relays nothing: a host without CORS headers is reached through a
relay of your own, a route of your server that sends `METHOD /relay/HOST/PATH` on
to `https://HOST/PATH` with the request's headers and body
([CORS and relays](http.md#cors-and-relays)). The page maps the origin to it next
to the policy:

```js
const relays = [{ origin: "https://api.individual.githubcopilot.com",
  through: "https://relay.example.com/relay/", credentialHeaders: ["authorization"] }];
await boot(document.querySelector("#dolly"), { images, image, modules, http: { policy, relays }, files });
```

The policy still judges the real URL, so it needs its rule as before. The relay
sees each request whole, its credentials among them (`credentialHeaders` lists
the ones it may see).

## How Pi starts

The recipe's `FILE /etc/dolly/init.slop` is the script `ENTRY` runs. `init`
wrote one that asks for the OpenRouter key; this one asks for two secrets at
hidden prompts, puts them in Pi's environment alone, and starts Pi with its
provider and model. `--offline` keeps Pi from catalog and update requests,
which the policy would refuse:

```
FILE /etc/dolly/init.slop
    cd /workspace
    secretenv ORDERS_TOKEN 'Orders token (not shown): ' secretenv COMPANY_LLM_KEY 'Model key (not shown): ' pi --offline --provider company --model MODEL
    printf '\nPi exited; this is a Slop shell.\n'
    /bin/foreground -i /bin/slop
```

`secretenv NAME PROMPT COMMAND` reads one secret without showing it; the page
can also type it (`paste(text)` on `boot()`'s handle). The secrets are gone when
Pi exits. The model can read them through its tools, and its provider then
sees what it prints; the policy keeps them from any other destination. Give the
agent a short-lived token that allows what the frontend allowed.

## What is measured

- `test/npm-browser.mjs`, in Chromium and Firefox: the README's "Pi with npm"
  as written, packed from the checkout and installed from a registry: the project
  `init` writes, built by `dolly-build` in the same browser, where Pi lists the
  extension and the skill, runs the extension's command, has `AGENTS.md`, the
  `todo` tool, Git and the workspace, and the policy refuses another origin;
  `boot()`'s `files` in the `default` image.
- `demos/pi/test/frontend-browser.mjs`, in Chromium and Firefox: the files of
  this guide built into an image: a scripted model on an origin of its own
  receives the system prompt and the skill with its key, Pi reads the skill,
  lists the orders with the user's token and cancels the one asked for; `curl`
  of `example.com`, of another path of the API and with `DELETE` is refused
  (status 9), without the token the API answers 401, and neither secret is shown.
- This guide's files as written, by hand in Chromium and Firefox (2026-10-31):
  the start script asks for both secrets, Pi starts with `AGENTS.md` and the skill,
  and the secrets are gone after it; Copilot and Bedrock through the README's
  relay answer a wrong key with their refusal, and without it their preflight
  fails.

## Not there yet

- npm ships the images and packages of the repository's `config/npm-images.txt`
  (`default`, `pi-minimal`, `python-data`; `git`, `cc`, `python` and Python's data
  libraries). Another program needs an image built in a Dolly checkout
  (`npm run image`), whose `dist/` the page then serves as `images`.
- `pi-minimal` is 27.5 MB compressed on first load.
- The interface is Pi's terminal UI.
