# CORS and the HTTP broker

## The constraint

Dolly cannot turn CORS off. The browser applies CORS after
`env.dolly_http_dispatch` reaches `fetch`, regardless of whether the requesting
code came from trusted application code or a compromised Wasm sandbox.
`mode: "no-cors"` is not a workaround: it produces an opaque response whose
status, headers, and body cannot be read. The server must opt in with CORS
response headers, or a server outside the browser must make the upstream
request.

This does not change Dolly's capability model. A relay is simply one allowed
destination reached through the existing HTTP broker. It does, however, change
the broker's effective authority: a general relay turns one allowed origin into
access to every origin that relay can reach.

## Practical choices

1. Prefer provider and source endpoints that return correct CORS headers. This
   keeps credentials end-to-end and needs no extra service.
2. For an endpoint without CORS, operate a small same-origin relay. Give it an
   exact upstream allowlist, method/header limits, redirect validation, body
   quotas, and abuse controls. A
   [Cloudflare Worker CORS proxy](https://developers.cloudflare.com/workers/examples/cors-header-proxy/)
   is one compact implementation pattern; an ordinary reverse proxy works too.
3. For development only, run the same reviewed relay locally. Browser flags or
   extensions that disable web security are not a deployable Dolly feature and
   do not help ordinary mobile users.

Do not send model credentials through a public anonymous CORS proxy. Its
operator can read the request, it enlarges the exfiltration surface, and its
availability and destination policy are outside Dolly's control. Dolly's public
demo therefore makes no promise that an arbitrary URL is readable: generic
HTTP(S) is permitted by its broker, but the destination browser still decides
whether the response may be exposed.

Pi's system prompt states the short operational rule: try the direct URL; when
CORS blocks a required service, use a reviewed same-origin relay; never route
credentials through a public proxy. The browser behavior is specified in
[MDN's CORS guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).

