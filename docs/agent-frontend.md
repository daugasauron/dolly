# An agent in place of a web frontend

A page can give its users an agent instead of a frontend: Pi, skills that
describe an existing system's API, and an HTTP policy that admits that API and
the model's provider and nothing else. The agent does through the API what the
frontend did; the backend stays as it is. This is the first use of the npm
packages ([Embedding](embedding.md)).

## The parts

The image is a recipe on `pi-runtime` (Pi, Janis, curl and Slop on `system`)
with the agent's system prompt, its skills and an entry that starts Pi
([Dollyfile](dollyfile.md)):

```
DOLLY 7
APPLICATION orders-agent
REQUIRES HOST runtime@0
...                                   (pi-runtime's modules: nothing is inherited)
FROM /v0.1.4/demos/pi/Dollyfile-pi-runtime SHA256
FILE /home/dolly/.pi/agent/SYSTEM.md
    You are the order desk assistant of a small shop. ...
FILE /home/dolly/.pi/agent/skills/orders/SKILL.md
    ---
    name: orders
    description: The shop's orders API - list orders, cancel one. Use it for every question about orders.
    ---
    Base URL https://api.example.com/api; every request sends
    `Authorization: Bearer $ORDERS_TOKEN`, with curl from the bash tool. ...
FILE /etc/agent/start.slop
    mkdir -p /workspace && cd /workspace
    secretenv ORDERS_TOKEN 'Orders token (not shown): ' pi-key OPENROUTER_API_KEY --offline --provider openrouter --model MODEL
    /bin/foreground -i /bin/slop
ENTRY /bin/foreground -i /bin/slop /etc/agent/start.slop
```

The page boots it with a policy of two rules ([HTTP](http.md)):

```js
const policy = { rules: [
  { origin: "https://api.example.com", pathPrefix: "/api/", methods: ["GET", "POST"], credentialHeaders: ["authorization"] },
  { origin: "https://openrouter.ai", path: "/api/v1/chat/completions", methods: ["POST"], credentialHeaders: ["authorization"] },
] };
await boot(element, { images, image: "orders-agent", modules, http: { policy } });
```

- `pi --offline` makes no catalog or update requests, which the policy would refuse.
- The model's provider: OpenRouter; Anthropic, for which Pi's client sends the
  header Anthropic's CORS asks for (`x-api-key` is then the credential header); or an OpenAI-compatible endpoint
  the backend serves itself, named in `~/.pi/agent/models.json` with
  `"apiKey": "$VARIABLE"`, and the policy then names one origin.
- The backend answers CORS for the page's origin, preflights of
  `Authorization` and `POST` included, and takes bearer tokens: Dolly's
  requests never carry cookies. It answers itself; the broker follows no
  redirect under a policy.

## Credentials

The user types the API token and the model's key at hidden prompts
(`secretenv`, `pi-key`), or the page pastes them there (`paste(text)` on
`boot()`'s handle). They live in Pi's environment alone and are gone when Pi
exits. The model can read them through its tools, and its provider then sees
what it prints; the policy keeps them from any other destination. Give the
agent a short-lived token that allows what the frontend allowed.

## What is measured

[`demos/pi/test/frontend-browser.mjs`](../demos/pi/test/frontend-browser.mjs),
in Chromium and Firefox: the page builds the image on the published
`pi-runtime`, a scripted model on an origin of its own receives the system
prompt and the skill with its key, Pi reads the skill, lists the orders with
the user's token and cancels the one asked for; `curl` of `example.com`, of
another path of the API and with `DELETE` is refused (status 9), without the
token the API answers 401, and neither secret is shown.

## Not there yet

- npm ships one image, `default`: `scripts/package-npm.mjs` packages it alone.
  An agent image needs an image package of its own, or a checkout's built
  image directory served as `images`.
- The npm packages do not build images: the recipe is built in a Dolly
  checkout (`npm run image`), or in the tab on Dolly's site (`/custom/`), as
  the test does.
- `boot()` takes no files or environment: a token comes from the user or the
  page's `paste()` into a prompt. The broker never injects credentials.
- First load: `pi-runtime` is 66.5 MB compressed, 35 MB of it `system`'s
  compiler; Pi on `default`'s packages instead would be about 25 MB, by the
  packages' sizes.
- The interface is Pi's terminal UI.
