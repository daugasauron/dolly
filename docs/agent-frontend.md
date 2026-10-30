# An agent in place of a web frontend

A page can give its users an agent instead of a frontend: Pi, instructions for
how to work in your company, skills that describe an existing system's API, and
an HTTP policy that admits that API and the model's provider and nothing else.
The agent does through the API what the frontend did; the backend stays as it
is. This guide builds such a page from the npm packages ([Embedding](embedding.md)).

## Start

Make the README's "Pi with npm" first: one `npm install`, an `index.html` and
a `serve.mjs`, and `node serve.mjs`. It runs `pi-minimal` (Pi, a shell, POSIX
tools, curl, ripgrep and fd) under a policy that admits OpenRouter alone. This
guide adds files beside them:

```
index.html                    the page: policy, relays, and the files it gives Pi
serve.mjs                     serves the directory; relays hosts without CORS
start.slop                    how Pi starts: the secrets it asks for, its provider and model
agent/AGENTS.md               how to work in your company
agent/skills/orders/SKILL.md  how to use your backend's API
agent/models.json             your model endpoint
```

## Pi's files

Pi reads its instructions, skills, extensions and model endpoints from files
in `~/.pi/agent/` (Pi's `docs/configuration.md`, in the image under
`/usr/lib/node_modules/@earendil-works/pi-coding-agent/docs/`). `boot()`'s
`files` writes the page's own over the image before Pi starts, so a change is an
edit and a reload; no image is rebuilt:

```html
<!doctype html>
<meta charset="utf-8">
<main id="dolly" style="position:fixed;inset:0"></main>
<script type="module">
  import { boot } from "./node_modules/@daugasauron/dolly/src/browser.mjs";
  import { images, image, modules } from "./node_modules/@daugasauron/dolly-image-pi-minimal/index.mjs";
  const text = async path => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.text();
  };
  const files = { "/etc/dolly/init.slop": await text("./start.slop") };
  for (const name of ["AGENTS.md", "skills/orders/SKILL.md", "models.json"]) {
    files[`/home/dolly/.pi/agent/${name}`] = await text(`./agent/${name}`);
  }
  const policy = { rules: [
    { origin: "https://api.example.com", pathPrefix: "/api/", methods: ["GET", "POST"], credentialHeaders: ["authorization"] },
    { origin: "https://llm.example.com", path: "/v1/chat/completions", methods: ["POST"], credentialHeaders: ["authorization"] },
  ] };
  await boot(document.querySelector("#dolly"), { images, image, modules, http: { policy }, files });
</script>
```

- `agent/AGENTS.md`: instructions Pi takes into every session: who the users
  are, what they may ask, what never to do. `APPEND_SYSTEM.md` adds to the
  system prompt instead; `SYSTEM.md` would replace the image's, which tells Pi
  what Dolly is and what fails there.
- `agent/skills/NAME/SKILL.md`: a skill, which Pi lists by its description and
  reads when a task needs it. Files a skill refers to go beside it, each in the
  page's list:

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

- `agent/extensions/NAME.js`: a Pi extension in JavaScript (Pi's TypeScript
  extensions are not measured in Dolly). The image's `dolly-tools.js` is one.
- `agent/models.json`: a model endpoint Pi does not know by name (below).
- `start.slop` replaces `pi-minimal`'s `/etc/dolly/init.slop`, which `ENTRY` runs.

Files are not secrets: Pi's tools can read them, and so can its model.

## Your backend

A rule admits the API's origin, the paths and methods the agent may use, and
the header that carries its token (`credentialHeaders`); [HTTP](http.md) has
every field. The backend answers CORS for the page's origin, preflights of
`Authorization` and `POST` included, and takes bearer tokens: Dolly's requests
never carry cookies. It answers itself; the broker follows no redirect under a
policy. A backend that cannot answer CORS is reached through a relay (below).

## The model's provider

- A provider Pi knows by name (Pi's `docs/providers.md`), such as OpenRouter,
  Anthropic or OpenAI: a rule for its API, and its key in the variable that
  page names (`OPENROUTER_API_KEY`). OpenRouter and Anthropic answer CORS.
- An endpoint that speaks OpenAI's or Anthropic's API, such as your gateway
  (LiteLLM, Azure OpenAI, a proxy of your own): an entry in `agent/models.json`,
  whose `apiKey` names the variable the key is in:

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

`serve.mjs` relays the hosts in its `relayed` set: `METHOD /relay/HOST/PATH` is
sent on to `https://HOST/PATH` with the request's headers and body. The page
maps the origin to it next to the policy:

```js
const relays = [{ origin: "https://api.individual.githubcopilot.com",
  through: new URL("./relay/", location.href).href, credentialHeaders: ["authorization"] }];
await boot(document.querySelector("#dolly"), { images, image, modules, http: { policy, relays }, files });
```

and `serve.mjs` lists the host: `const relayed = new Set(["api.individual.githubcopilot.com"]);`.
The policy still judges the real URL, so it needs its rule as before. The relay
sees each request whole, its credentials among them (`credentialHeaders` lists
the ones it may see). In production it is a route of your own server, with the
same protocol ([CORS and relays](http.md#cors-and-relays)).

## How Pi starts

`start.slop` asks for the secrets at hidden prompts, puts them in Pi's
environment alone, and starts Pi with its provider and model. `--offline` keeps
Pi from catalog and update requests, which the policy would refuse:

```
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
  as written, packed from the checkout and installed from a registry; `boot()`'s
  `files` in the image.
- `demos/pi/test/frontend-browser.mjs`, in Chromium and Firefox: the files of
  this guide built into an image: a scripted model on an origin of its own
  receives the system prompt and the skill with its key, Pi reads the skill,
  lists the orders with the user's token and cancels the one asked for; `curl`
  of `example.com`, of another path of the API and with `DELETE` is refused
  (status 9), without the token the API answers 401, and neither secret is shown.
- This guide's files as written, by hand in Chromium and Firefox (2026-10-31):
  `start.slop` asks for both secrets, Pi starts with `AGENTS.md` and the skill,
  and the secrets are gone after it; Copilot and Bedrock through the README's
  relay answer a wrong key with their refusal, and without it their preflight
  fails.

## Not there yet

- npm ships two images, `default` and `pi-minimal`. A program neither has
  (Python, Git, a compiler) needs an image built in a Dolly checkout
  (`npm run image`), whose `dist/` the page then serves as `images`.
- `pi-minimal` is 27.5 MB compressed on first load.
- The interface is Pi's terminal UI.
